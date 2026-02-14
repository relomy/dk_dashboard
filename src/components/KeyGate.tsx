import { useState } from 'react'
import type { FormEvent } from 'react'
import type { StorageMode } from '../lib/accessKey'

interface KeyGateProps {
  onSave: (key: string, mode: StorageMode) => void
}

function KeyGate({ onSave }: KeyGateProps) {
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<StorageMode>('local')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!value.trim()) {
      return
    }
    onSave(value.trim(), mode)
  }

  return (
    <section className="key-gate">
      <h1>Enter Access Key</h1>
      <p>Provide your API key to load contest snapshots.</p>
      <form onSubmit={submit}>
        <label htmlFor="api-key">Access key</label>
        <input
          id="api-key"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          placeholder="dk_..."
        />
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={mode === 'session'}
            onChange={(event) => setMode(event.target.checked ? 'session' : 'local')}
          />
          Session only
        </label>
        <button type="submit">Save key</button>
      </form>
    </section>
  )
}

export default KeyGate
