export const questions = [
  {
    "id": "q1-tree-planting",
    "title": "Tree planting",
    "question": "For tree planting in Canadian forest restoration, how do planting-stock traits (seedling size, nursery fertilization, mycorrhizal inoculation) affect survival and growth, and how do competing vegetation and site preparation change that?"
  },
  {
    "id": "q2-created-marshes",
    "title": "Marsh recovery",
    "question": "How long do created marshes take to reach biodiversity and function comparable to natural reference wetlands, and which attributes lag?"
  },
  {
    "id": "q3-grassland-gaps",
    "title": "Grassland evidence gaps",
    "question": "For grassland restoration in Canada, which intervention-outcome combinations have little or no evidence, and where is the graph densest?"
  }
] as const

export function normalizeQuestion(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "")
}
