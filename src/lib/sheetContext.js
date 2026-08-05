import { createContext } from 'react'

// True inside a recap sheet. The tab views are shared with the full-screen
// tabs, where their entrance flourishes are the point; inside a sheet those
// same flourishes run while the sheet is sliding and fight it for frames.
export const SheetContext = createContext(false)
