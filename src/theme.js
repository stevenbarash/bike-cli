import chalk, { Chalk } from "chalk";

export const createTheme = ({ colorEnabled = true } = {}) => {
  const supportedLevel = chalk.supportsColor?.level ?? 0;
  const level = colorEnabled ? Math.max(1, supportedLevel) : 0;
  const colors = new Chalk({ level });

  return {
    title: (text) => colors.cyanBright.bold(text),
    accent: (text) => colors.cyan(text),
    muted: (text) => colors.gray(text),
    good: (text) => colors.green(text),
    warn: (text) => colors.yellow(text),
    bad: (text) => colors.red(text),
    section: (text) => colors.cyan.bold(text),
    body: (text) => colors.white(text),
    dim: (text) => colors.dim(text),
    colors,
  };
};
