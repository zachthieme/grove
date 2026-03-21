import type { Person } from '../api/types'
import styles from './HeadcountView.module.css'

interface TeamCount {
  team: string
  disciplines: Map<string, number>
  hiring: number
  transfer: number
  total: number
}

function computeTeamCounts(people: Person[]): TeamCount[] {
  const teamOrder: string[] = []
  const teamMap = new Map<string, TeamCount>()

  for (const person of people) {
    const team = person.team
    if (!team) continue

    let tc = teamMap.get(team)
    if (!tc) {
      tc = { team, disciplines: new Map(), hiring: 0, transfer: 0, total: 0 }
      teamMap.set(team, tc)
      teamOrder.push(team)
    }

    if (person.status === 'Active') {
      const disc = person.discipline || 'Unknown'
      tc.disciplines.set(disc, (tc.disciplines.get(disc) || 0) + 1)
      tc.total++
    } else if (person.status === 'Hiring' || person.status === 'Open') {
      tc.hiring++
      tc.total++
    } else if (person.status === 'Transfer') {
      tc.transfer++
      tc.total++
    }
  }

  return teamOrder.map((t) => teamMap.get(t)!)
}

interface HeadcountViewProps {
  people: Person[]
}

export default function HeadcountView({ people }: HeadcountViewProps) {
  const teamCounts = computeTeamCounts(people)

  if (teamCounts.length === 0) {
    return <div className={styles.container}>No team data available.</div>
  }

  return (
    <div className={styles.container}>
      {teamCounts.map((tc) => (
        <div key={tc.team} className={styles.card}>
          <h3 className={styles.teamName}>{tc.team}</h3>
          {Array.from(tc.disciplines.entries()).map(([disc, count]) => (
            <div key={disc} className={styles.row}>
              <span className={styles.label}>{disc}</span>
              <span className={styles.count}>{count}</span>
            </div>
          ))}
          {tc.hiring > 0 && (
            <div className={`${styles.row} ${styles.hiringRow}`}>
              <span className={styles.label}>Hiring / Open</span>
              <span className={styles.count}>{tc.hiring}</span>
            </div>
          )}
          {tc.transfer > 0 && (
            <div className={`${styles.row} ${styles.transferRow}`}>
              <span className={styles.label}>Transfer</span>
              <span className={styles.count}>{tc.transfer}</span>
            </div>
          )}
          <hr className={styles.separator} />
          <div className={styles.totalRow}>
            <span>Total</span>
            <span>{tc.total}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
