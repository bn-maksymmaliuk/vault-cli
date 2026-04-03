import chalk from "chalk";
import ora, { Ora } from "ora";


export const log = {
  /** Header banner */
  banner() {
    console.log();
    console.log(chalk.hex("#FFD700").bold("  ◆ vault-cli"));
    console.log(chalk.dim("  ─────────────────────────────"));
  },

  /** Key-value info line */
  info(label: string, value: string) {
    console.log(`  ${chalk.dim(label + ":")} ${chalk.cyan(value)}`);
  },

  /** Verbose debug line */
  verbose(msg: string) {
    console.log(`  ${chalk.dim("›")} ${chalk.gray(msg)}`);
  },

  /** Section divider */
  divider() {
    console.log(chalk.dim("  ─────────────────────────────"));
  },

  /** Success message */
  success(msg: string) {
    console.log();
    console.log(`  ${chalk.green("✔")} ${chalk.green(msg)}`);
    console.log();
  },

  /** Error message */
  error(msg: string) {
    console.log();
    console.log(`  ${chalk.red("✖")} ${chalk.red(msg)}`);
    console.log();
  },

  /** Warning message */
  warn(msg: string) {
    console.log(`  ${chalk.yellow("⚠")} ${chalk.yellow(msg)}`);
  },

  /** Start a spinner — available for future use */
  spinner(text: string): Ora {
    return ora({
      text: chalk.dim(text),
      prefixText: "  ",
      color: "yellow",
    }).start();
  },

  /** Per-secret success line */
  secretOk(key: string, path: string) {
    console.log(
      `  ${chalk.green("✔")} ${chalk.white(key.padEnd(24))} ${chalk.dim("←")} ${chalk.dim(path)}`
    );
  },

  /** Per-secret failure line */
  secretFail(key: string, path: string, reason: string) {
    console.log(
      `  ${chalk.red("✖")} ${chalk.white(key.padEnd(24))} ${chalk.dim("←")} ${chalk.dim(path)}`
    );
    console.log(`    ${chalk.red(reason)}`);
  },
};


