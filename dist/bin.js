#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const execa_1 = __importDefault(require("execa"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const inquirer_1 = __importDefault(require("inquirer"));
const lodash_1 = __importDefault(require("lodash"));
const ora_1 = __importDefault(require("ora"));
const path_1 = __importDefault(require("path"));
const yargs_parser_1 = __importDefault(require("yargs-parser"));
const url_1 = __importDefault(require("url"));
const help = `Please specify a package to add.

$ hygen-add PACKAGE [--name NAME] [--prefix PREFIX] [--pm PACKAGE_MANAGER]

  PACKAGE: npm module or Git repository
           - note: for an npm module named 'hygen-react', PACKAGE is 'react'
   --name: package name for a Git repo when cannot infer from repo URL (optional)
 --prefix: prefix added generators, avoids clashing names (optional)
     --pm: package manager to use (yarn|yarn2|npm|pnpm|bun) (default: yarn)
`;
const tmpl = (x) => path_1.default.join('_templates', x);
const resolvePackage = (pkg, opts) => {
    if (pkg.match(/^(http|git\+ssh)/)) {
        if (opts.name) {
            return { name: opts.name, isUrl: true };
        }
        return { name: lodash_1.default.last(url_1.default.parse(pkg).path.split('/')), isUrl: true };
    }
    return { name: `hygen-${pkg}`, isUrl: false };
};
const checkYarnVersion = () => __awaiter(this, void 0, void 0, function* () {
    try {
        const { stdout } = yield execa_1.default.shell('yarn --version');
        const version = stdout.trim();
        return {
            isAvailable: true,
            version,
        };
    }
    catch (error) {
        return {
            isAvailable: false,
            version: null,
        };
    }
});
const getPackageManagerCommand = (pm, isDevDependency = true) => __awaiter(this, void 0, void 0, function* () {
    const commands = {
        npm: `npm install ${isDevDependency ? '--save-dev' : ''}`,
        pnpm: `pnpm add ${isDevDependency ? '--save-dev' : ''}`,
        bun: `bun add ${isDevDependency ? '--dev' : ''}`,
    };
    if (pm === 'yarn') {
        const yarnInfo = yield checkYarnVersion();
        let command = `yarn`;
        if (!yarnInfo.isAvailable) {
            command = `${path_1.default.join(__dirname, '../node_modules/.bin/')}yarn`;
        }
        return `${command} add ${isDevDependency ? '--dev' : ''}`;
    }
    return commands[pm];
});
const main = () => __awaiter(this, void 0, void 0, function* () {
    const { red, green, yellow } = chalk_1.default;
    const args = yargs_parser_1.default(process.argv.slice(2));
    const [pkg] = args._;
    if (!pkg) {
        console.log(help);
        process.exit(1);
    }
    const { name, isUrl } = resolvePackage(pkg, args);
    const packageManager = args.pm || 'yarn';
    const spinner = ora_1.default(`Adding: ${name}`).start();
    try {
        const installCommand = yield getPackageManagerCommand(packageManager);
        spinner.text = `Adding: ${name} using ${packageManager}`;
        yield execa_1.default.shell(`${installCommand} ${isUrl ? pkg : name}`);
        let templatePath = path_1.default.join('./node_modules', name, '_templates');
        const exists = yield fs_extra_1.default.pathExists(templatePath);
        if (!exists) {
            yield execa_1.default.shell(`yarn unplug ${name}`);
            const { stdout } = yield execa_1.default.shell(`ls -d .yarn/unplugged/${name}-* | head -n 1 `);
            templatePath = path_1.default.join(stdout, 'node_modules', name, '_templates');
        }
        yield fs_extra_1.default.mkdirp('_templates');
        spinner.stop();
        for (const g of yield fs_extra_1.default.readdir(templatePath)) {
            const maybePrefixed = args.prefix ? `${args.prefix}-${g}` : g;
            const wantedTargetPath = tmpl(maybePrefixed);
            const sourcePath = path_1.default.join(templatePath, g);
            if (yield fs_extra_1.default.pathExists(wantedTargetPath)) {
                if (!(yield inquirer_1.default
                    .prompt([
                    {
                        message: `'${maybePrefixed}' already exists. Overwrite? (Y/n): `,
                        name: 'overwrite',
                        prefix: '      🤔 :',
                        type: 'confirm',
                    },
                ])
                    .then(({ overwrite }) => overwrite))) {
                    console.log(yellow(` skipped: ${maybePrefixed}`));
                    continue;
                }
            }
            yield fs_extra_1.default.copy(sourcePath, wantedTargetPath, {
                recursive: true,
            });
            console.log(green(`   added: ${maybePrefixed}`));
        }
    }
    catch (ex) {
        spinner.stop();
        console.log(red(`\n\nCan't add ${name}${isUrl ? ` (source: ${pkg})` : ''}\n\n`), ex);
        process.exit(1);
    }
});
main();
//# sourceMappingURL=bin.js.map