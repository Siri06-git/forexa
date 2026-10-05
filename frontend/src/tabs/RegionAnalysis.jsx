// Region & Lead-time Analysis tab — cross-sectional analysis
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { getRegions, getOverview } from '../api'

const LEADS = [1,2,3,4,5,6,7,8,9,10]

export default function RegionAnalysis() {
  const [overviews, setOverviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all(LEADS.map(lt => getOverview(lt).then(d => ({ lead_time: lt, ...d }))))
      .then(data => setOverviews(data))
      .finally(() => setLoading(false))
  }, [])

  const chartData = overviews.map(d => ({
    day: `D+${d.lead_time}`,
    confidence: +(d.mean_confidence * 100).toFixed(2),
    bust_prob: +(d.mean_bust_probability * 100).toFixed(2),
    skill_gap: +((d.mean_confidence - d.mean_bust_probability - d.mean_bust_probability) * 100).toFixed(2),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="synth-notice">
        ⚠️ Lead-time breakdown uses real API values from /api/overview per lead time. Regional breakdown uses synthetic proportional offsets clearly labelled.
      </div>

      {loading ? (
        <div className="card"><div className="state-box"><div className="spinner"/><div className="state-title">Loading…</div></div></div>
      ) : (
        <>
          {/* Area chart: confidence degradation with lead time */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">Confidence Degradation with Lead Time</div>
              <div className="section-sub">All regions · Live API values</div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v, n) => [`${v.toFixed(1)}%`, n === 'confidence' ? 'Mean Confidence' : 'Mean Bust Prob']} />
                <Legend />
                <Line type="monotone" dataKey="confidence" stroke="var(--chart-teal)" strokeWidth={2.5} name="confidence" dot={{ r: 5 }} />
                <Line type="monotone" dataKey="bust_prob" stroke="var(--danger)" strokeWidth={2.5} name="bust_prob" dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar: confidence per lead time */}
          <div className="grid-2">
            <div className="card">
              <div className="section-header">
                <div className="section-title">Mean Confidence by Lead Day</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} />
                  <Tooltip formatter={v => `${v.toFixed(1)}%`} />
                  <Bar dataKey="confidence" fill="var(--chart-teal)" radius={[4,4,0,0]} name="Confidence"
                    label={{ position: 'top', fill: 'var(--text-muted)', fontSize: 9, formatter: v => `${v.toFixed(0)}%` }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-header">
                <div className="section-title">Bust Probability by Lead Day</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} />
                  <Tooltip formatter={v => `${v.toFixed(1)}%`} />
                  <Bar dataKey="bust_prob" fill="var(--danger)" radius={[4,4,0,0]} name="Bust Prob"
                    label={{ position: 'top', fill: 'var(--text-muted)', fontSize: 9, formatter: v => `${v.toFixed(0)}%` }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary table */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">Lead-Time Summary Table</div>
              <div className="section-sub">Live /api/overview values</div>
            </div>
            <table className="metric-table">
              <thead>
                <tr><th>Lead Day</th><th>Mean Confidence</th><th>Mean Bust Prob</th><th>Risk Level</th></tr>
              </thead>
              <tbody>
                {overviews.map(d => {
                  const risk = d.mean_bust_probability >= 0.60 ? 'high' : d.mean_bust_probability >= 0.35 ? 'moderate' : 'low'
                  return (
                    <tr key={d.lead_time}>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.85rem' }}>D+{d.lead_time}</td>
                      <td style={{ color: 'var(--chart-teal)', fontFamily: 'JetBrains Mono' }}>{(d.mean_confidence*100).toFixed(2)}%</td>
                      <td style={{ fontFamily: 'JetBrains Mono' }}>{(d.mean_bust_probability*100).toFixed(2)}%</td>
                      <td><span className={`risk-badge risk-${risk}`}>{risk}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
