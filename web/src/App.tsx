import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>Org Chart</header>
      <main className={styles.main}>Upload a file to get started</main>
    </div>
  )
}
