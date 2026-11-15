import { ArrowDown, ArrowUp, ArrowsDownUp, Equals, Minus, Question } from '@phosphor-icons/react'
import type { IconProps } from '@phosphor-icons/react'

const icons: Record<string, typeof ArrowUp> = {
  increase: ArrowUp, above_reference: ArrowUp, decrease: ArrowDown, below_reference: ArrowDown,
  mixed: ArrowsDownUp, no_effect: Minus, comparable: Equals, unclear: Question,
}

export default function DirectionIcon({ value, ...props }: IconProps & { value: string }) {
  const Icon = icons[value] ?? Question
  return <Icon weight="bold" aria-hidden="true" {...props} />
}
