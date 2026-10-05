import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@mui/material'
import AdjustIcon from '@mui/icons-material/Adjust'
import PageHeader from '../components/PageHeader'

export default function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="That page rolled into the gutter." />
      <Button
        component={RouterLink}
        to="/standings"
        variant="contained"
        startIcon={<AdjustIcon />}
      >
        Back to standings
      </Button>
    </>
  )
}
