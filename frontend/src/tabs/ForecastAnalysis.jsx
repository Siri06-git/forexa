// Forecast Analysis tab — select region/date/lead, analyze, show explanation & feature signals
import { useState, useEffect, useCallback } from 'react'
import { getRegions, getCases, getCase, analyzeCase, getDemoHighRisk, getDemoLowRisk, getOverview } from '../api'
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

function ProbGauge({ value, risk }) {
  const pct = Math.round(value * 100)
  const color = risk === 'high' ? 'var(--danger)' : risk === 'moderate' ? 'var(--warning)' : 'var(--success)'
  const data = [{ value: pct, fill: color }]
  return (
    <div className="prob-meter">
      <div className="prob-arc-wrap" style={{ width: 160, height: 160 }}>
        <ResponsiveContainer width={160} height={160}>
          <RadialBarChart
            cx={80} cy={80} innerRadius={50} outerRadius={75}
            startAngle={225} endAngle={-45}
            data={data}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: 'var(--bg-secondary)' }}
              dataKey="value"
              cornerRadius={6}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="prob-arc-label">
          <span className="prob-arc-value" style={{ color }}>{pct}%</span>
          <span className="prob-arc-sub">Bust Prob</span>
        </div>
      </div>
    </div>
  )
}

function FeatureRow({ label, value, unit = '' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{value != null ? value : '—'}{unit}</span>
    </div>
  )
}

export default function ForecastAnalysis({
  initialRegion = 'Odisha',
  initialLeadTime = 6,
  initialCaseId = null,
  autoRun = false,
  onResetAutoRun,
  onNavigate
}) {
  const [regions, setRegions] = useState([])
  const [region, setRegion] = useState(initialRegion)
  const [leadTime, setLeadTime] = useState(initialLeadTime)
  const [cases, setCases] = useState([])
  const [selectedCase, setSelectedCase] = useState(initialCaseId)
  const [caseDetail, setCaseDetail] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [regionLoading, setRegionLoading] = useState(true)

  // Regional D+1..D+10 confidence trend data
  const [regionalTrend, setRegionalTrend] = useState([])

  useEffect(() => {
    getRegions().then(r => {
      setRegions(r)
      if (!initialRegion && r.length > 0) setRegion(r[0])
    }).finally(() => setRegionLoading(false))
  }, [initialRegion])

  // Sync region prop
  useEffect(() => {
    if (initialRegion) setRegion(initialRegion)
  }, [initialRegion])

  useEffect(() => {
    if (initialLeadTime) setLeadTime(initialLeadTime)
  }, [initialLeadTime])

  useEffect(() => {
    if (!region) return
    getCases(region, leadTime).then(ids => {
      setCases(ids)
      if (initialCaseId && ids.includes(initialCaseId)) {
        setSelectedCase(initialCaseId)
      } else if (ids.length > 0) {
        setSelectedCase(ids[0])
      }
    })
  }, [region, leadTime, initialCaseId])

  useEffect(() => {
    if (!selectedCase) { setCaseDetail(null); return }
    getCase(selectedCase).then(d => {
      setCaseDetail(d)
    })
  }, [selectedCase])

  const runAnalysis = useCallback(() => {
    if (!caseDetail) return
    setLoading(true); setError(null); setResult(null)
    analyzeCase(caseDetail.region, caseDetail.forecast_date, caseDetail.lead_time)
      .then(r => setResult(r))
      .catch(e => setError(e.response?.data?.detail || e.message))
      .finally(() => {
        setLoading(false)
        if (onResetAutoRun) onResetAutoRun()
      })
  }, [caseDetail, onResetAutoRun])

  // Trigger analysis automatically if requested or when case detail changes after autoRun flag
  useEffect(() => {
    if (autoRun && caseDetail) {
      runAnalysis()
    }
  }, [autoRun, caseDetail, runAnalysis])

  // Fetch Day 1-10 confidence trend for the active region
  useEffect(() => {
    if (!region) return
    Promise.all([1,2,3,4,5,6,7,8,9,10].map(lt => getOverview(lt).then(ov => ({ lt, ...ov }))))
      .then(results => {
        const trend = results.map(r => ({
          day: `D+${r.lt}`,
          confidence: +(r.mean_confidence * 100).toFixed(1),
          bust_prob: +(r.mean_bust_probability * 100).toFixed(1),
        }))
        setRegionalTrend(trend)
      })
  }, [region])

  const handleLoadDemo = (type) => {
    const fetcher = type === 'high' ? getDemoHighRisk : getDemoLowRisk
    fetcher().then(list => {
      if (list && list.length > 0) {
        const item = list[0]
        setRegion(item.region)
        setLeadTime(item.lead_time)
        setSelectedCase(item.id)
        getCase(item.id).then(d => {
          setCaseDetail(d)
          setLoading(true)
          analyzeCase(d.region, d.forecast_date, d.lead_time)
            .then(r => setResult(r))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
        })
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="synth-notice">
        ⚠️ Scientific features and bust predictions come from the live LightGBM + Isotonic Calibrator FastAPI backend.
      </div>

      {/* Controls & Quick Load Bar */}
      <div className="controls-bar" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            🔬 Forecast Analysis & Diagnostics Controls
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.8rem', padding: '5px 12px' }}
              onClick={() => handleLoadDemo('high')}
            >
              🔴 Load High-Risk Demo Case
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--success)', borderColor: 'var(--success)', fontSize: '0.8rem', padding: '5px 12px' }}
              onClick={() => handleLoadDemo('low')}
            >
              🟢 Load Low-Risk Demo Case
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div className="ctrl-group">
            <div className="ctrl-label">Region</div>
            <select value={region} onChange={e => setRegion(e.target.value)} disabled={regionLoading}>
              {regions.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>

          <div className="ctrl-group">
            <div className="ctrl-label">Lead Day</div>
            <select value={leadTime} onChange={e => setLeadTime(+e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10].map(d => <option key={d} value={d}>D+{d}</option>)}
            </select>
          </div>

          <div className="ctrl-group">
            <div className="ctrl-label">Case ID</div>
            <select value={selectedCase || ''} onChange={e => setSelectedCase(+e.target.value)}>
              <option value="">— select case —</option>
              {cases.map(id => <option key={id} value={id}>Case #{id}</option>)}
            </select>
          </div>

          {caseDetail && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--bg-secondary)', padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div>
                <div className="ctrl-label">Forecast Date</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.85rem', color: 'var(--accent-light)' }}>{caseDetail.forecast_date}</div>
              </div>
              <div>
                <div className="ctrl-label">Lead Time</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.85rem', color: 'var(--accent-light)' }}>D+{caseDetail.lead_time}</div>
              </div>
            </div>
          )}

          {/* Step 6: Run Bust Analysis button */}
          <button className="btn btn-primary" onClick={runAnalysis} disabled={!caseDetail || loading} style={{ marginLeft: 'auto', padding: '10px 22px' }}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analyzing Case…</> : '▶ Run Bust Analysis'}
          </button>
        </div>
      </div>

      {/* Case Raw Feature Metadata */}
      {caseDetail && (
        <div className="card">
          <div className="section-header">
            <div className="section-title">Case #{caseDetail.id} — Forecast Parameters ({caseDetail.region})</div>
            <div className="section-sub">Forecast Date: {caseDetail.forecast_date} · Lead: D+{caseDetail.lead_time}</div>
          </div>
          <div className="grid-3">
            <div>
              <FeatureRow label="Region" value={caseDetail.region} />
              <FeatureRow label="Forecast Date" value={caseDetail.forecast_date} />
              <FeatureRow label="Lead Time" value={`D+${caseDetail.lead_time}`} />
              <FeatureRow label="Season" value={caseDetail.season} />
              <FeatureRow label="Monsoon Phase" value={caseDetail.monsoon_phase} />
              <FeatureRow label="Atm. Regime" value={caseDetail.atmospheric_regime} />
            </div>
            <div>
              <FeatureRow label="Ensemble Spread Pct" value={caseDetail.ensemble_spread_percentile?.toFixed(1)} unit="th" />
              <FeatureRow label="Regime Similarity" value={caseDetail.regime_similarity?.toFixed(1)} unit="%" />
              <FeatureRow label="Model Disagreement" value={caseDetail.model_disagreement?.toFixed(1)} unit="%" />
              <FeatureRow label="Z500 ACC" value={caseDetail.z500_acc?.toFixed(4)} />
              <FeatureRow label="Forecast Error" value={caseDetail.forecast_error?.toFixed(4)} />
              <FeatureRow label="Historical Error P95" value={caseDetail.historical_error_p95?.toFixed(4)} />
            </div>
            <div>
              <FeatureRow label="MJO Phase" value={caseDetail.mjo_phase} />
              <FeatureRow label="SST Anomaly" value={caseDetail.sst_anomaly?.toFixed(4)} unit=" °C" />
              <FeatureRow label="Blocking Index" value={caseDetail.blocking_index?.toFixed(4)} />
              <FeatureRow label="Jet Stream Shift" value={caseDetail.jet_stream_shift?.toFixed(4)} unit=" °" />
              <FeatureRow label="Actual Ground Truth Label" value={caseDetail.bust_label === 1 ? '🔴 Bust' : '🟢 No Bust'} />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <div className="state-box">
            <div className="state-icon">❌</div>
            <div className="state-title">Analysis Error</div>
            <div className="state-msg">{error}</div>
          </div>
        </div>
      )}

      {/* Model Analysis Results */}
      {result && (
        <>
          <div className="grid-2">
            {/* Step 4 & Step 6 Output: Calibrated Bust Probability, Confidence & Tier Flags */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">Model Bust Probability & Confidence</div>
                <span className={`risk-badge risk-${result.risk_level}`}>{result.risk_level} risk</span>
              </div>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                <ProbGauge value={result.calibrated_bust_probability} risk={result.risk_level} />
                <div style={{ flex: 1 }}>
                  <FeatureRow label="Calibrated Bust Probability" value={`${(result.calibrated_bust_probability*100).toFixed(2)}%`} />
                  <FeatureRow label="Forecast Confidence Score" value={`${result.forecast_confidence.toFixed(2)}%`} />
                  <FeatureRow label="Assessed Risk Tier" value={result.risk_level.toUpperCase()} />
                  <div style={{ marginTop: 14 }}>
                    <div className="tier-flags">
                      <div className={`tier-flag ${result.tier1_bust ? 'triggered' : 'clear'}`}>
                        {result.tier1_bust ? '⚠️ Triggered' : '✓ Clear'} — Tier 1 (Z500 ACC {'<'} 0.40)
                      </div>
                      <div className={`tier-flag ${result.tier2_bust ? 'triggered' : 'clear'}`}>
                        {result.tier2_bust ? '⚠️ Triggered' : '✓ Clear'} — Tier 2 (Error {'>'} P95)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 7: Inspect Why Confidence is Low / High */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">Step 7: Diagnostic Explanation (Why Confidence is Low/High)</div>
              </div>
              {result.explanations.length === 0 ? (
                <div className="state-box">
                  <div className="state-icon">✅</div>
                  <div className="state-title">High Confidence Forecast</div>
                  <div className="state-msg">No uncertainty risk factors were triggered for this forecast case.</div>
                </div>
              ) : (
                <div className="explanation-list">
                  {result.explanations.map((e, i) => (
                    <div key={i} className="expl-item" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      <span className="expl-icon" style={{ color: 'var(--danger)' }}>⚠️</span>
                      <span style={{ fontWeight: 500 }}>{e}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Step 8: Inspect Feature Signals */}
          {caseDetail && (
            <div className="card">
              <div className="section-header">
                <div className="section-title">Step 8: Feature Signal Breakdown</div>
                <div className="section-sub">Values driving model confidence calculation</div>
              </div>
              <div className="grid-2">
                <div>
                  <SignalBar label="Ensemble Spread Percentile" value={caseDetail.ensemble_spread_percentile} max={100} unit="th" highIsRisk={true} />
                  <SignalBar label="Regime Similarity" value={caseDetail.regime_similarity} max={100} unit="%" highIsRisk={true} />
                  <SignalBar label="Model Disagreement" value={caseDetail.model_disagreement} max={100} unit="%" highIsRisk={true} />
                </div>
                <div>
                  <SignalBar label="Z500 Anomaly Correlation (ACC)" value={caseDetail.z500_acc * 100} max={100} unit="%" highIsRisk={false} />
                  <SignalBar label="Forecast Error Ratio (vs P95)" value={(caseDetail.forecast_error / Math.max(0.1, caseDetail.historical_error_p95)) * 100} max={200} unit="%" highIsRisk={true} />
                </div>
              </div>
            </div>
          )}

          {/* Step 9: Inspect Day 1–10 Confidence Trend */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">Step 9: Day 1–10 Lead-Time Confidence Trend for {region}</div>
              <div className="section-sub">Degradation profile from D+1 to D+10</div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={regionalTrend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v, n) => [`${v}%`, n === 'confidence' ? 'Mean Confidence' : 'Bust Probability']} />
                <Legend />
                <Line type="monotone" dataKey="confidence" stroke="var(--chart-teal)" strokeWidth={2.5} name="confidence" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="bust_prob" stroke="var(--danger)" strokeWidth={2.5} name="bust_prob" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Empty State */}
      {!result && !error && !loading && (
        <div className="card">
          <div className="state-box">
            <div className="state-icon">🔬</div>
            <div className="state-title">Select a Case and Click "Run Bust Analysis"</div>
            <div className="state-msg">Choose region and case above or click a demo case button to inspect live bust diagnostics.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function SignalBar({ label, value, max = 100, unit = '', highIsRisk = true }) {
  const val = value != null ? value : 0
  const pct = Math.min(100, Math.max(0, (val / max) * 100))
  const isDanger = highIsRisk ? pct > 75 : pct < 40

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, color: isDanger ? 'var(--danger)' : 'var(--accent-light)' }}>
          {val.toFixed(1)}{unit}
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isDanger ? 'var(--danger)' : 'var(--chart-teal)',
          transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  )
}
