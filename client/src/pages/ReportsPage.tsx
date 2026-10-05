import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Card,
  CardContent,
  TextField,
  Typography,
  Stack,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import type { WeeklyReport } from '@bowling/shared'
import { useAuth } from '../auth/AuthContext'
import { useLeague } from '../data/LeagueContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ReportsPage() {
  const { isAdmin } = useAuth()
  const { league } = useLeague()

  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Upload form state (admin only).
  const [season, setSeason] = useState('')
  const [week, setWeek] = useState('')
  const [date, setDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchReports()
      setReports(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  // Default the season field to the current league season once it loads.
  useEffect(() => {
    if (league?.season && !season) setSeason(league.season)
  }, [league, season])

  async function handleUpload(e: FormEvent) {
    e.preventDefault()
    setUploadError(null)
    if (!file) {
      setUploadError('Please choose a PDF file.')
      return
    }
    const data = new FormData()
    data.append('file', file)
    data.append('season', season)
    data.append('week', week)
    data.append('date', date)
    setUploading(true)
    try {
      await api.uploadReport(data)
      setWeek('')
      setDate('')
      setFile(null)
      await loadReports()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(report: WeeklyReport) {
    if (!window.confirm(`Delete the report for Week ${report.week}?`)) return
    try {
      await api.deleteReport(report.id)
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <>
      <PageHeader title="Weekly Reports" subtitle="Scanned score sheets for each week" />

      {isAdmin && (
        <Card sx={{ mb: 3, maxWidth: 560 }}>
          <CardContent>
            <Typography variant="h3" gutterBottom>
              Upload a report
            </Typography>
            <Box component="form" onSubmit={handleUpload}>
              <Stack spacing={2}>
                {uploadError && <Alert severity="error">{uploadError}</Alert>}
                <TextField
                  label="Season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Week"
                  type="number"
                  value={week}
                  onChange={(e) => setWeek(e.target.value)}
                  fullWidth
                />
                <TextField
                  label="Date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
                <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                  {file ? file.name : 'Choose PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </Button>
                <Button type="submit" variant="contained" disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : reports.length === 0 ? (
        <Typography color="text.secondary">No reports uploaded yet.</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell align="right">Week</TableCell>
                <TableCell>Season</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Filename</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id} hover>
                  <TableCell align="right">{report.week}</TableCell>
                  <TableCell>{report.season}</TableCell>
                  <TableCell>{formatDate(report.date)}</TableCell>
                  <TableCell>{report.filename}</TableCell>
                  <TableCell align="right">{formatSize(report.sizeBytes)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        component="a"
                        href={api.getReportUrl(report.id)}
                        target="_blank"
                        rel="noreferrer"
                        startIcon={<OpenInNewIcon />}
                      >
                        View
                      </Button>
                      {isAdmin && (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="delete report"
                          onClick={() => handleDelete(report)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
