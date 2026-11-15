import { escapeHTML as e } from './ui.js'

export const technicalTerms = {
  inoculation: {
    name: 'Inoculation and mycorrhizae',
    match: /inoculat|mycorrhiz/i,
    text: 'Inoculation adds fungi or other microorganisms to seedlings or soil. Mycorrhizal fungi form associations with plant roots.',
  },
  nursery: {
    name: 'Nursery fertilization',
    match: /nursery fertili|nutrient loading/i,
    text: 'Adding nutrients while seedlings are grown in a nursery, before they are planted out.',
  },
  preparation: {
    name: 'Site preparation',
    match: /site preparation/i,
    text: 'Work before planting to change soil, ground cover or other growing conditions.',
  },
  biomass: {
    name: 'Biomass',
    match: /biomass/i,
    text: 'The mass of living material, such as plant stems, leaves and roots.',
  },
  richness: {
    name: 'Species richness and diversity',
    match: /richness|diversity/i,
    text: 'Richness is the number of species. Diversity also considers how common each species is.',
  },
  abundance: {
    name: 'Abundance and density',
    match: /abundance|density/i,
    text: 'Abundance is the number of organisms. Density is the number in a given area or volume.',
  },
  composition: {
    name: 'Community composition',
    match: /community composition/i,
    text: 'Which species are present and how common each one is.',
  },
  function: {
    name: 'Ecosystem function',
    match: /ecosystem function|ecosystem processes/i,
    text: 'Processes such as nutrient cycling, decomposition and carbon storage.',
  },
  hydrology: {
    name: 'Hydrology and geomorphology',
    match: /hydrolog|geomorpholog/i,
    text: 'Hydrology concerns how water moves and is stored. Geomorphology concerns the shape of land and channels.',
  },
  amendments: {
    name: 'Organic amendments',
    match: /organic amendment/i,
    text: 'Organic materials added to soil, such as compost or manure.',
  },
  herbicide: {
    name: 'Herbicide',
    match: /herbicide/i,
    text: 'A chemical used to kill or control plants.',
  },
  exclusion: {
    name: 'Herbivore exclusion',
    match: /herbivore exclusion/i,
    text: 'Keeping plant-eating animals out, usually with fencing or protective shelters.',
  },
  passive: {
    name: 'Passive recovery',
    match: /passive recovery/i,
    text: 'Allowing a site to recover without active restoration treatments.',
  },
  chronosequence: {
    name: 'Chronosequence',
    match: /chronosequence/i,
    text: 'A comparison of different sites of different ages, used to study possible changes over time.',
  },
}

export function labelWithTerms(label) {
  const entry = Object.entries(technicalTerms).find(([, term]) => term.match.test(label))
  if (!entry) return e(label)
  const [key, term] = entry
  return `${e(label)} <button type="button" class="term-info" data-term="${key}" aria-label="${e(`Explain ${term.name}`)}" aria-haspopup="dialog" aria-controls="term-dialog" aria-expanded="false">?</button>`
}
