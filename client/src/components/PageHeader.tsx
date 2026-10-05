import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export default function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: ReactNode
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h1" gutterBottom>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="subtitle1" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Box>
  )
}
