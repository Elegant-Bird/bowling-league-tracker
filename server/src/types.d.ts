// Global Express Request augmentation. Must stay a script file (no top-level
// import/export) so `declare namespace Express` merges into the global
// namespace rather than becoming a local module augmentation.
declare namespace Express {
  interface Request {
    user?: { username: string }
  }
}
