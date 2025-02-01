#!/usr/bin/env node

import chalk from 'chalk'
import execa from 'execa'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import L from 'lodash'
import ora from 'ora'
import path from 'path'
import parser from 'yargs-parser'
import URL from 'url'

const help = `Please specify a package to add.

$ hygen-add PACKAGE [--name NAME] [--prefix PREFIX] [--pm PACKAGE_MANAGER]

  PACKAGE: npm module or Git repository
           - note: for an npm module named 'hygen-react', PACKAGE is 'react'
   --name: package name for a Git repo when cannot infer from repo URL (optional)
 --prefix: prefix added generators, avoids clashing names (optional)
     --pm: package manager to use (yarn|yarn2|npm|pnpm|bun) (default: yarn)
`

const tmpl = (x) => path.join('_templates', x)

const resolvePackage = (pkg, opts) => {
  if (pkg.match(/^(http|git\+ssh)/)) {
    if (opts.name) {
      return { name: opts.name, isUrl: true }
    }
    return { name: L.last(URL.parse(pkg).path.split('/')), isUrl: true }
  }
  return { name: `hygen-${pkg}`, isUrl: false }
}

const checkYarnVersion = async () => {
  try {
    const { stdout } = await execa.shell('yarn --version')
    const version = stdout.trim()

    return {
      isAvailable: true,
      version,
    }
  } catch (error) {
    return {
      isAvailable: false,
      version: null,
    }
  }
}

const getPackageManagerCommand = async (pm, isDevDependency = true) => {
  const commands = {
    npm: `npm install ${isDevDependency ? '--save-dev' : ''}`,
    pnpm: `pnpm add ${isDevDependency ? '--save-dev' : ''}`,
    bun: `bun add ${isDevDependency ? '--dev' : ''}`,
  }

  if (pm === 'yarn') {
    const yarnInfo = await checkYarnVersion()
    let command = `yarn`

    if (!yarnInfo.isAvailable) {
      command = `${path.join(__dirname, '../node_modules/.bin/')}yarn`
    }

    return `${command} add ${isDevDependency ? '--dev' : ''}`
  }

  return commands[pm]
}

const main = async () => {
  const { red, green, yellow } = chalk
  const args = parser(process.argv.slice(2))
  const [pkg] = args._
  if (!pkg) {
    console.log(help)
    process.exit(1)
  }
  const { name, isUrl } = resolvePackage(pkg, args)
  const packageManager = args.pm || 'yarn'
  const spinner = ora(`Adding: ${name}`).start()

  try {
    const installCommand = await getPackageManagerCommand(packageManager)

    spinner.text = `Adding: ${name} using ${packageManager}`

    await execa.shell(`${installCommand} ${isUrl ? pkg : name}`)

    let templatePath = path.join('./node_modules', name, '_templates')
    const exists = await fs.pathExists(templatePath)

    if (!exists) {
      await execa.shell(`yarn unplug ${name}`)

      const { stdout } = await execa.shell(`ls -d .yarn/unplugged/${name}-* | head -n 1 `)
      templatePath = path.join(stdout, 'node_modules', name, '_templates')
    }

    await fs.mkdirp('_templates')

    spinner.stop()

    for (const g of await fs.readdir(templatePath)) {
      const maybePrefixed = args.prefix ? `${args.prefix}-${g}` : g
      const wantedTargetPath = tmpl(maybePrefixed)
      const sourcePath = path.join(templatePath, g)

      if (await fs.pathExists(wantedTargetPath)) {
        if (
          !(await inquirer
            .prompt([
              {
                message: `'${maybePrefixed}' already exists. Overwrite? (Y/n): `,
                name: 'overwrite',
                prefix: '      🤔 :',
                type: 'confirm',
              },
            ])
            .then(({ overwrite }) => overwrite))
        ) {
          console.log(yellow(` skipped: ${maybePrefixed}`))
          continue
        }
      }

      await fs.copy(sourcePath, wantedTargetPath, {
        recursive: true,
      })
      console.log(green(`   added: ${maybePrefixed}`))
    }
  } catch (ex) {
    spinner.stop()
    console.log(
      red(`\n\nCan't add ${name}${isUrl ? ` (source: ${pkg})` : ''}\n\n`),
      ex
    )

    process.exit(1)
  }
}

main()
