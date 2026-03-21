import { useMemo } from 'react'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import PersonNode from '../components/PersonNode'
import styles from './ColumnView.module.css'

interface ColumnViewProps {
  people: Person[]
  selectedId: string | null
  onSelect: (id: string) => void
  changes?: Map<string, PersonChange>
  ghostPeople?: Person[]
}

interface RowItem {
  person: Person
  depth: number
  ghost?: boolean
}

export default function ColumnView({ people, selectedId, onSelect, changes, ghostPeople = [] }: ColumnViewProps) {
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

    // Append ghost people to their original team columns
    if (ghostPeople.length > 0) {
      const teamMap = new Map(result.map((col) => [col.team, col]))
      for (const gp of ghostPeople) {
        const col = teamMap.get(gp.team)
        if (col) {
          col.rows.push({ person: gp, depth: 0, ghost: true })
        } else {
          // Team no longer exists in working; create a column for it
          const newCol = { team: gp.team, rows: [{ person: gp, depth: 0, ghost: true }] }
          result.push(newCol)
          teamMap.set(gp.team, newCol)
        }
      }
    }

    return result
  }, [people, ghostPeople])

  if (people.length === 0 && ghostPeople.length === 0) {
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
                ghost={row.ghost}
                changes={changes?.get(row.person.id)}
                onClick={() => onSelect(row.person.id)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
