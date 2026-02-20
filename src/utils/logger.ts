import chalk from 'chalk';

const isDebug = process.env.OPENQED_DEBUG === '1';

export function debug(msg: string): void {
  if (isDebug) {
    console.error(chalk.gray(`[debug] ${msg}`));
  }
}

export function info(msg: string): void {
  console.error(chalk.blue(`[info] ${msg}`));
}

export function warn(msg: string): void {
  console.error(chalk.yellow(`[warn] ${msg}`));
}

export function error(msg: string): void {
  console.error(chalk.red(`[error] ${msg}`));
}
