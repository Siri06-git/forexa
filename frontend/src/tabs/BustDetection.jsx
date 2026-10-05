// Bust Detection tab — browse high-risk cases, show bust probability + tier flags + interactive scatter plot
import { useState, useEffect } from 'react'
import { getDemoHighRisk, getDemoLowRisk } from '../api'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, ReferenceLine
} from 'recharts'

export default function BustDetection({ onNavigate }) {
  const [highRisk, setHighRisk] = useState([])
  const [lowRisk, setLowRisk] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')  // all / high / low
  const [sortBy, setSortBy] = useState('prob_desc')

  useEffect(() => {
    Promise.all([getDemoHighRisk(), getDemoLowRisk()])
      .then(([h, l]) => { setHighRisk(h); setLowRisk(l) })
      .finally(() => setLoading(false))
  }, [])

  const allCases = [
    ...highRisk.map(c => ({ ...c, demo_type: 'high' })),
    ...lowRisk.map(c => ({ ...c, demo_type: 'low' })),
  ]

  const filtered = allCases.filter(c => {
    if (filter === 'high') return c.demo_type === 'high'
    if (filter === 'low') return c.demo_type === 'low'
    return true
  }).sort((a, b) => {
    if (sortBy === 'prob_desc') return (b.calibrated_prob||0) - (a.calibrated_prob||0)
    if (sortBy === 'prob_asc') return (a.calibrated_prob||0) - (b.calibrated_prob||0)
    if (sortBy === 'lead') return a.lead_time - b.lead_time
    return 0
  })

  // Scatter chart data: x=ensemble_spread, y=calibrated_prob, colored by bust label
  const scatterData = allCases.map(c => ({
    x: c.ensemble_spread_percentile || 0,
    y: (c.calibrated_prob || 0) * 100,
    z: c.lead_time,
    region: c.region,
    label: c.bust_label,
    risk: c.demo_type,
    id: c.id,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="synth-notice">
        ⚠️ Live demo cases are retrieved directly from the database and processed by the live LightGBM + Isotonic model.
      </div>

      {/* Scatter: ensemble spread vs bust probability */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">Ensemble Spread vs Calibrated Bust Probability</div>
          <div className="section-sub">Synthetic dataset cases · Bubble Size = Lead Time</div>
        </div>
        {loading ? (
          <div className="state-box"><div className="spinner" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name="Ensemble Spread %" label={{ value: 'Ensemble Spread (percentile)', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 11 }} type="number" />
              <YAxis dataKey="y" name="Bust Prob %" domain={[0,100]} tickFormatter={v=>`${v}%`} label={{ value: 'Bust Prob', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} type="number" />
              <ZAxis dataKey="z" range={[40, 200]} name="Lead Time" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', shadow: 'var(--shadow-md)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{d.region} (Case #{d.id})</div>
                      <div>Ensemble Spread: {d.x.toFixed(1)}th percentile</div>
                      <div>Bust Prob: <strong style={{ color: d.risk === 'high' ? 'var(--danger)' : 'var(--success)' }}>{d.y.toFixed(1)}%</strong></div>
                      <div>Lead Time: D+{d.z}</div>
                      <div>Ground Truth Bust: {d.label ? '🔴 Yes' : '🟢 No'}</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={40} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: '40% warning', fill: 'var(--warning)', fontSize: 10 }} />
              <ReferenceLine y={75} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: '75% high-risk', fill: 'var(--danger)', fontSize: 10 }} />
              <Scatter data={scatterData.filter(d=>d.risk==='high')} fill="var(--danger)" fillOpacity={0.75} name="High Risk" />
              <Scatter data={scatterData.filter(d=>d.risk==='low')} fill="var(--success)" fillOpacity={0.75} name="Low Risk" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Filters & Sorting Bar */}
      <div className="controls-bar" style={{ marginBottom: 0 }}>
        <div className="ctrl-label">Filter Cases:</div>
        {['all','high','low'].map(f => (
          <button key={f} className={`btn ${filter===f?'btn-primary':'btn-ghost'}`} onClick={()=>setFilter(f)} style={{ padding: '5px 14px', fontSize: '0.8rem' }}>
            {f === 'all' ? 'All Demo Cases' : f === 'high' ? '🔴 High Risk Only' : '🟢 Low Risk Only'}
          </button>
        ))}
        <div className="ctrl-label" style={{ marginLeft: 16 }}>Sort By:</div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ minWidth: 'auto' }}>
          <option value="prob_desc">Bust Probability ↓</option>
          <option value="prob_asc">Bust Probability ↑</option>
          <option value="lead">Lead Time ↑</option>
        </select>
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{filtered.length} cases displayed</div>
      </div>

      {/* Cases grid */}
      {loading ? (
        <div className="state-box"><div className="spinner"/></div>
      ) : (
        <div className="grid-2">
          {filtered.map((c, i) => (
            <CaseCard
              key={i}
              data={c}
              onSelect={() => onNavigate({ caseId: c.id, region: c.region, leadTime: c.lead_time, autoAnalyze: true })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CaseCard({ data, onSelect }) {
  const prob = data.calibrated_prob || 0
  const risk = prob >= 0.75 ? 'high' : prob >= 0.40 ? 'moderate' : 'low'
  const tier1 = data.z500_acc < 0.40
  const tier2 = data.forecast_error > data.historical_error_p95

  return (
    <div className="card" style={{ borderLeft: `4px solid ${risk === 'high' ? 'var(--danger)' : risk === 'moderate' ? 'var(--warning)' : 'var(--success)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{data.region}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
            Case #{data.id} · {data.forecast_date} · D+{data.lead_time}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: risk === 'high' ? 'var(--danger)' : risk === 'moderate' ? 'var(--warning)' : 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
            {(prob*100).toFixed(1)}%
          </div>
          <span className={`risk-badge risk-${risk}`}>{risk} risk</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
        <span>Ensemble Spread: <strong>{data.ensemble_spread_percentile?.toFixed(1)}th</strong></span>
        <span>Z500 ACC: <strong style={{ color: tier1 ? 'var(--danger)' : undefined }}>{data.z500_acc?.toFixed(3)}</strong></span>
        <span>Model Disagreement: <strong>{data.model_disagreement?.toFixed(1)}%</strong></span>
        <span>Forecast Err: <strong style={{ color: tier2 ? 'var(--danger)' : undefined }}>{data.forecast_error?.toFixed(2)}</strong></span>
        <span>Regime Sim: <strong>{data.regime_similarity?.toFixed(1)}%</strong></span>
        <span>Ground Truth Bust: <strong>{data.bust_label ? '🔴 Yes' : '🟢 No'}</strong></span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div className="tier-flags">
          <span className={`tier-flag ${tier1 ? 'triggered' : 'clear'}`}>{tier1 ? '⚠️ T1 Triggered' : '✓ T1 Clear'}</span>
          <span className={`tier-flag ${tier2 ? 'triggered' : 'clear'}`}>{tier2 ? '⚠️ T2 Triggered' : '✓ T2 Clear'}</span>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.78rem' }}
          onClick={onSelect}
        >
          🔬 Analyze Case →
        </button>
      </div>
    </div>
  )
}
