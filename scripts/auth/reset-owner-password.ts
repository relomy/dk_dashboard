import { resetOwnerPassword } from './lib/commands'
import { resolveAuthDatabaseName } from './lib/config'
import { createWranglerRunner } from './lib/sql-runner'

function readFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) {
    return undefined
  }
  return args[index + 1]
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const username = readOption(args, '--username') ?? ''
  const temporaryPassword = readOption(args, '--temporary-password')
  const confirm = readFlag(args, '--confirm')
  const remote = readFlag(args, '--remote')
  const databaseName = resolveAuthDatabaseName(process.env)

  const runner = createWranglerRunner({ databaseName, remote })
  const result = await resetOwnerPassword(runner, {
    username,
    temporaryPassword,
    confirm,
  })

  console.log(`Reset owner password for: ${result.username}`)
  console.log(`Temporary password: ${result.temporaryPassword}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`auth:reset-owner-password failed: ${message}`)
  process.exit(1)
})
