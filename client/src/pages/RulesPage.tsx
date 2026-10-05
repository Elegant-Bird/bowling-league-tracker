import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { LEAGUE_RULES } from '@bowling/shared'
import PageHeader from '../components/PageHeader'

export default function RulesPage() {
  return (
    <>
      <PageHeader
        title="Rules & FAQ"
        subtitle="How scoring, handicaps, and absences work"
      />

      {LEAGUE_RULES.map((item, idx) => (
        <Accordion key={idx} defaultExpanded={idx === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>{item.question}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {item.answer.map((para, i) => (
              <Typography key={i} color="text.secondary" sx={{ mb: i < item.answer.length - 1 ? 1.5 : 0 }}>
                {para}
              </Typography>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </>
  )
}
