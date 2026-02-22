import { bootstrapOwner } from './lib/commands'
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
  const force = readFlag(args, '--force')
  const remote = readFlag(args, '--remote')
  const databaseName = process.env.AUTH_DB_NAME ?? 'dk-dashboard-auth'

  const runner = createWranglerRunner({ databaseName, remote })
  const result = await bootstrapOwner(runner, {
    username,
    temporaryPassword,
    force,
  })

  console.log(`Bootstrapped owner user: ${result.username}`)
  console.log(`Temporary password: ${result.temporaryPassword}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`auth:bootstrap-owner failed: ${message}`)
  process.exit(1)
})
