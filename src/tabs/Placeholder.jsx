export default function Placeholder({ code, note }) {
  return (
    <div className="placeholder">
      <div className="placeholder-code">{code}</div>
      <div className="placeholder-note">{note}</div>
    </div>
  )
}
