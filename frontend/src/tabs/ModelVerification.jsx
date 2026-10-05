// Model Verification tab — live metrics from /api/verification + reliability chart & baselines
import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts'
import { getVerification } from '../api'

export default function ModelVerification() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getVerification()
      .then(d => setMetrics(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card"><div className="state-box"><div className="spinner"/><div className="state-title">Loading verification metrics from backend model…</div></div></div>
  if (error) return <div className="card"><div className="state-box"><div className="state-icon">❌</div><div className="state-title">Error</div><div className="state-msg">{error}</div></div></div>

  const reliabilityData = metrics?.reliability_curve || []
  const compData = metrics?.baselines || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="synth-notice">
        ⚠️ Verification metrics, reliability binning, and baseline comparisons are calculated dynamically by the live FastAPI backend on the holdout test set (30% of 2,000 synthetic cases).
      </div>

      {/* Live metrics cards */}
      <div className="grid-3">
        <MetricCard
          title="PR-AUC"
          value={metrics.pr_auc.toFixed(3)}
          interpretation="Precision-Recall Area Under Curve. Skill score over random baseline."
          good={metrics.pr_auc > 0.6}
        />
        <MetricCard
          title="ROC-AUC"
          value={metrics.roc_auc.toFixed(3)}
          interpretation="Receiver Operating Characteristic AUC. 0.5 = random, 1.0 = perfect."
          good={metrics.roc_auc > 0.65}
        />
        <MetricCard
          title="Brier Score"
          value={metrics.brier_score.toFixed(3)}
          interpretation="Mean squared error of probabilistic forecast. Lower is better."
          good={metrics.brier_score < 0.25}
          invert
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <div style={{ padding: '6px 14px', background: 'var(--success-dim)', borderRadius: 6, color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--success)' }}>
          Probability Calibration Method: {metrics.calibration}
        </div>
      </div>

      {/* Reliability diagram & baseline comparison bar chart */}
      <div className="grid-2">
        <div className="card">
          <div className="section-header">
            <div className="section-title">Reliability Diagram (Calibration)</div>
            <div className="section-sub">Predicted vs Observed frequency · Test set</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={reliabilityData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="predicted" tickFormatter={v => `${(v*100).toFixed(0)}%`} label={{ value: 'Predicted Probability', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0, 1]} label={{ value: 'Observed Frequency', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip formatter={(v, n) => [`${(v*100).toFixed(1)}%`, n === 'observed' ? 'Observed Frequency' : 'Perfect Calibration']} />
              <Line type="monotone" dataKey="perfect" stroke="var(--border-light)" strokeDasharray="5 5" dot={false} name="Perfect calibration" strokeWidth={1.5} />
              <Line type="monotone" dataKey="observed" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--accent)' }} name="Forexa (Isotonic)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Baseline comparison bar chart */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">PR-AUC vs Baselines</div>
            <div className="section-sub">Forexa vs Persistence / Ensemble Spread / Climatology</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={compData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="method" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-15} textAnchor="end" />
              <YAxis domain={[0, 1]} />
              <Tooltip formatter={(v) => v.toFixed(3)} />
              <Bar dataKey="pr_auc" fill="var(--chart-blue)" radius={[4,4,0,0]} name="PR-AUC"
                label={{ position: 'top', fill: 'var(--text-muted)', fontSize: 10, formatter: v => v.toFixed(3) }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full baseline comparison table */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">Full Baseline Performance Comparison Table</div>
          <div className="section-sub">Computed live by backend evaluate metrics on test split</div>
        </div>
        <table className="metric-table">
          <thead>
            <tr><th>Method</th><th>PR-AUC ↑</th><th>ROC-AUC ↑</th><th>Brier Score ↓</th><th>vs Forexa PR-AUC</th></tr>
          </thead>
          <tbody>
            {compData.map((row, i) => (
              <tr key={row.method}>
                <td style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--accent-light)' : undefined }}>{row.method}</td>
                <td className={i === 0 ? 'best' : ''}>{row.pr_auc.toFixed(3)}</td>
                <td className={i === 0 ? 'best' : ''}>{row.roc_auc.toFixed(3)}</td>
                <td style={{ color: i === 0 ? 'var(--success)' : undefined }}>{row.brier.toFixed(3)}</td>
                <td style={{ color: i === 0 ? 'var(--text-muted)' : metrics.pr_auc > row.pr_auc ? 'var(--success)' : 'var(--danger)', fontSize: '0.8rem', fontFamily: 'JetBrains Mono' }}>
                  {i === 0 ? '— baseline —' : metrics.pr_auc > row.pr_auc ? `+${((metrics.pr_auc - row.pr_auc)*100).toFixed(1)}pp` : `${((metrics.pr_auc - row.pr_auc)*100).toFixed(1)}pp`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ title, value, interpretation, good, invert }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${good ? 'var(--success)' : 'var(--warning)'}` }}>
      <div className="card-title">{title}</div>
      <div className="card-value" style={{ color: good ? 'var(--success)' : 'var(--warning)', marginTop: 8, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{interpretation}</div>
      <div style={{ marginTop: 8 }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: good ? 'var(--success-dim)' : 'var(--warning-dim)',
          color: good ? 'var(--success)' : 'var(--warning)',
        }}>{good ? '✓ Good Performance' : '~ Fair Performance'}</span>
      </div>
    </div>
  )
}
