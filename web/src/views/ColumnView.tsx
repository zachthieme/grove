import { useMemo } from 'react'
import type { Person } from '../api/types'
import PersonNode from '../components/PersonNode'
import styles from './ColumnView.module.css'

interface ColumnViewProps {
  people: Person[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface RowItem {
  person: Person
  depth: number
}

export default function ColumnView({ people, selectedId, onSelect }: ColumnViewProps) {
  const columns = useMemo(() => {
    // Build lookup maps
    const byId = new Map<string, Person>()
    for (const p of people) {
      byId.set(p.id, p)
    }

    // Build team order (preserve insertion order from data) and team members
    const teamOrder: string[] = []
    const teamMembers = new Map<string, Person[]>()
    for (const p of people) {
      if (!teamMembers.has(p.team)) {
        teamOrder.push(p.team)
        teamMembers.set(p.team, [])
      }
      teamMembers.get(p.team)!.push(p)
    }

    // Build children map: parentId -> children within same team
    const childrenMap = new Map<string, Person[]>()
    for (const p of people) {
      if (p.managerId && byId.has(p.managerId)) {
        const manager = byId.get(p.managerId)!
        if (manager.team === p.team) {
          if (!childrenMap.has(p.managerId)) {
            childrenMap.set(p.managerId, [])
          }
          childrenMap.get(p.managerId)!.push(p)
        }
      }
    }

    // For each team, build ordered rows with depth
    const result: { team: string; rows: RowItem[] }[] = []

    for (const team of teamOrder) {
      const members = teamMembers.get(team)!
      const memberSet = new Set(members.map((p) => p.id))

      // Find roots within this team: no managerId, or manager not in this team
      const roots = members.filter(
        (p) => !p.managerId || !memberSet.has(p.managerId)
      )

      // Walk depth-first
      const rows: RowItem[] = []
      const walk = (person: Person, depth: number) => {
        rows.push({ person, depth })
        const children = childrenMap.get(person.id) || []
        for (const child of children) {
          walk(child, depth + 1)
        }
      }

      for (const root of roots) {
        walk(root, 0)
      }

      result.push({ team, rows })
    }

    return result
  }, [people])

  if (people.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <div className={styles.container}>
      {columns.map((col) => (
        <div key={col.team} className={styles.column}>
          <div className={styles.header}>{col.team}</div>
          {col.rows.map((row) => (
            <div
              key={row.person.id}
              className={styles.row}
              style={{ paddingLeft: row.depth * 20 + 8 }}
            >
              <PersonNode
                person={row.person}
                selected={row.person.id === selectedId}
                onClick={() => onSelect(row.person.id)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
