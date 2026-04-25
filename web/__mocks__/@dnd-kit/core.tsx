import { vi } from 'vitest'
import type { ReactNode } from 'react'

// Wrap children in a div to preserve DOM structure parity with the real
// dnd-kit context (which mounts wrapper elements). Golden snapshots assume
// this shape — don't drop the wrapper.
export const DndContext = ({ children }: { children: ReactNode }) => <div>{children}</div>
export const DragOverlay = ({ children }: { children: ReactNode }) => <div>{children}</div>
export const useDraggable = () => ({
  attributes: {},
  listeners: {},
  setNodeRef: vi.fn(),
  isDragging: false,
})
export const useDroppable = () => ({ setNodeRef: vi.fn(), isOver: false })
export class MouseSensor {}
export class KeyboardSensor {}
export const useSensor = () => ({})
export const useSensors = () => []
