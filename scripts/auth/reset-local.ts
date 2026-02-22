import { resetLocalAuth } from './lib/commands'
import { resolveAuthDatabaseName } from './lib/config'
import { createWranglerRunner } from './lib/sql-runner'

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) {
    return undefined
  }
  return args[index + 1]
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const username = readOption(args, '--username') ?? process.env.LOCAL_OWNER_USERNAME ?? 'owner'
  const temporaryPassword = readOption(args, '--temporary-password')
  const databaseName = resolveAuthDatabaseName(process.env)

  const runner = createWranglerRunner({ databaseName, remote: false })
  const result = await resetLocalAuth(runner, {
    username,
    temporaryPassword,
  })

  console.log('Local auth tables reset and owner reseeded.')
  console.log(`Owner username: ${result.username}`)
  console.log(`Temporary password: ${result.temporaryPassword}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`auth:reset-local failed: ${message}`)
  process.exit(1)
})
