import { Router, type Request, type Response, type NextFunction } from 'express'
import multer, { type FileFilterCallback } from 'multer'
import { ObjectId } from 'mongodb'
import type { WeeklyReport } from '@bowling/shared'
import { reportsMeta, getReportsBucket, type ReportMetaDoc } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const reportsRouter = Router()

type MulterRequest = Request & { file?: Express.Multer.File }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(null, false)
    }
  },
})

/** Explicit 8-field mapper — never stripMongoId (which would leak gridFsFileId). */
function toWeeklyReport(doc: ReportMetaDoc): WeeklyReport {
  return {
    id: doc._id!.toHexString(),
    season: doc.season,
    week: doc.week,
    date: doc.date,
    filename: doc.filename,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
  }
}

// POST /api/reports — JWT first, then multer, then handler.
reportsRouter.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req: MulterRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'A PDF file is required' })
        return
      }

      const b = (req.body ?? {}) as Record<string, unknown>
      const season = b.season
      const weekRaw = b.week
      const date = b.date

      if (typeof season !== 'string' || season.trim() === '') {
        res.status(400).json({ error: 'season is required' })
        return
      }
      const week = Number(weekRaw)
      if (!Number.isInteger(week) || week <= 0) {
        res.status(400).json({ error: 'week must be a positive integer' })
        return
      }
      if (typeof date !== 'string' || date.trim() === '') {
        res.status(400).json({ error: 'date is required' })
        return
      }

      const bucket = getReportsBucket()
      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        contentType: 'application/pdf',
      })

      await new Promise<void>((resolve, reject) => {
        uploadStream.on('error', reject)
        uploadStream.on('finish', () => resolve())
        uploadStream.end(req.file!.buffer)
      })

      const gridFsFileId = uploadStream.id as ObjectId

      const metaDoc: ReportMetaDoc = {
        gridFsFileId,
        season,
        week,
        date,
        filename: req.file.originalname,
        contentType: 'application/pdf',
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
      }

      try {
        const inserted = await reportsMeta().insertOne(metaDoc)
        res.status(201).json(toWeeklyReport({ ...metaDoc, _id: inserted.insertedId }))
      } catch (metaErr) {
        // Metadata insert failed — delete the orphaned GridFS file.
        try {
          await bucket.delete(gridFsFileId)
        } catch {
          // best-effort cleanup
        }
        throw metaErr
      }
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/reports — public, metadata only.
reportsRouter.get('/', async (_req: Request, res: Response) => {
  const docs = await reportsMeta()
    .find({})
    .sort({ season: 1, week: 1 })
    .toArray()
  res.status(200).json(docs.map(toWeeklyReport))
})

// GET /api/reports/:id — public, streams the PDF inline.
reportsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const id = String(req.params.id)
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid report id' })
    return
  }

  const doc = await reportsMeta().findOne({ _id: new ObjectId(id) })
  if (!doc) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${doc.filename.replace(/"/g, '')}"`,
  )

  const bucket = getReportsBucket()
  const downloadStream = bucket.openDownloadStream(doc.gridFsFileId)
  downloadStream.on('error', next)
  downloadStream.pipe(res)
})

// DELETE /api/reports/:id — JWT, idempotent.
reportsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid report id' })
    return
  }

  const doc = await reportsMeta().findOne({ _id: new ObjectId(id) })
  if (!doc) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  const bucket = getReportsBucket()
  try {
    await bucket.delete(doc.gridFsFileId)
  } catch {
    // File already missing — log-level warning, continue (idempotent).
    console.warn('GridFS file already missing for report', id)
  }
  await reportsMeta().deleteOne({ _id: doc._id })
  res.status(204).end()
})
