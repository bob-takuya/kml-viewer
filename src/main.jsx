import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import FBXViewer from './FBXViewer'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FBXViewer />
  </StrictMode>,
)
