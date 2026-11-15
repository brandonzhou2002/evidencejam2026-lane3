import { hasBreakdown, studyBreakdown } from './answer-data.js'

const enhanced =
  'The source sentence says fertilization strengthened scarification’s positive effect on seedling growth. The graph therefore shows an increase, while the table’s baseline rule labels moderation claims as unclear.'
export const packNotes = {
  'camo:edge_3fb326f2a6c3': enhanced,
  'camo:edge_ee5aa30bcc2d': enhanced,
}

export const sourcePackNotes = {
  'camo:edge_1107dc4d1096':
    'This claim is coded as “no effect”, but the quotation reports a significant difference in microbial community structure between younger restored sites and older restored/reference sites. The coding and quotation do not align. This comparison does not establish a recovery timeline.',
  'camo:edge_e9f249d67651':
    'This claim is coded as “no effect”, but the quotation reports significant differences in microbial community structure with time since restoration, with older and reference sites grouping closer together than younger sites. The coding and quotation do not align. This comparison does not establish a recovery timeline.',
}

export const animalOutcomeNote =
  'Classification note: all six populated “Animal abundance & occurrence” cells contain plant outcomes in the supplied map. Open these cells for details before interpreting this column as animal evidence.'

export const findingPackNotes = {
  'q3:planting:animal_abundance':
    'This cell is mapped under animal abundance, but its claim measures nitrogen captured in alder plants. It does not measure animal abundance.',
  'q3:topsoil_transfer:animal_abundance':
    'This cell is mapped under animal abundance, but its claim measures nitrogen captured in alder plants. It does not measure animal abundance.',
  'q3:herbicide:animal_abundance':
    'This cell is mapped under animal abundance, but its five claims concern plant species, seed heads, and seedlings. These are plant outcomes, not measurements of animal abundance.',
  'q3:mowing_cutting:animal_abundance':
    'This cell is mapped under animal abundance, but its three claims concern rough fescue, seedlings, and herbs. These are plant outcomes, not measurements of animal abundance.',
  'q3:mulch:animal_abundance':
    'This cell is mapped under animal abundance, but its two claims concern native seedling density and rough fescue cover. These are plant outcomes, not measurements of animal abundance.',
  'q3:smoke_ash:animal_abundance':
    'This cell is mapped under animal abundance, but all three claims measure plant seedling density under ash or smoke-plus-ash treatments. They do not measure animal abundance.',
  'q3:burning:invasive_abundance':
    'All four claims in this cell concern combined treatments involving burning and glyphosate, sometimes with mowing or sethoxydim. The reported reductions were observed under these combinations; these claims do not isolate the effect of burning alone.',
}

export function certaintyPackNote(finding) {
  const agreement = finding.certainty_rationale.match(/\+1 (\d+) studies agree/)
  if (!agreement || !hasBreakdown(finding)) return ''
  return `The supplied pack says “${agreement[1]} studies agree”, but its study counts show different results. ${studyBreakdown(finding)}. This is not unanimous agreement.`
}
