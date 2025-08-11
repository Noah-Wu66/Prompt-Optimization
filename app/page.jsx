"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

export default function HomePage() {
  const [tab, setTab] = useState('txt2img');
  const [prompt, setPrompt] = useState('');
  const [optimized, setOptimized] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [processingMounted, setProcessingMounted] = useState(false);
  const [processingVisible, setProcessingVisible] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState([]);
  const [resultMounted, setResultMounted] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const reasoningTimerRef = useRef(null);
  const optimizedRef = useRef('');

  // 防御性移除托管环境可能注入的 Tailwind CDN 脚本（生产不应使用）
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('script[src*="cdn.tailwindcss.com"]'));
    nodes.forEach((n) => n.parentElement?.removeChild(n));
  }, []);

  const canSubmit = useMemo(() => {
    if (!prompt.trim()) return false;
    if (tab === 'img2img' && !file) return false;
    return true;
  }, [prompt, tab, file]);

  function onFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setFilePreview(url);
    } else {
      setFilePreview('');
    }
  }

  function startReasoningFeed() {
    const steps = [
      '解析输入与意图…',
      '提取主体与关键视觉要素…',
      '结构化场景、镜头与光照信息…',
      '补全常见缺失细节并规避歧义…',
      '语言润色与风格统一…',
      '一致性校验与成稿…',
    ];
    let index = 0;
    setReasoningLogs([]);
    if (reasoningTimerRef.current) clearInterval(reasoningTimerRef.current);
    reasoningTimerRef.current = setInterval(() => {
      setReasoningLogs((prev) => {
        if (index < steps.length) {
          const next = [...prev, steps[index]];
          index += 1;
          return next;
        }
        return prev;
      });
    }, 600);
  }

  function stopReasoningFeed() {
    if (reasoningTimerRef.current) {
      clearInterval(reasoningTimerRef.current);
      reasoningTimerRef.current = null;
    }
  }

  async function handleOptimizeAndRun() {
    setLoading(true);
    setError('');
    optimizedRef.current = '';
    setOptimized('');
    // 结果模块优雅退场
    if (resultVisible) {
      setResultVisible(false);
      setTimeout(() => setResultMounted(false), 260);
    } else {
      setResultMounted(false);
    }
    // 处理中模块优雅入场
    setProcessingMounted(true);
    setTimeout(() => setProcessingVisible(true), 0);
    startReasoningFeed();
    try {
      if (tab === 'txt2img') {
        const res = await fetch('/api/optimize-and-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        optimizedRef.current = data.optimizedPrompt || '';
        setOptimized(optimizedRef.current);
      } else {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (file) form.append('image', file);
        const res = await fetch('/api/optimize-and-edit', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        optimizedRef.current = data.optimizedPrompt || '';
        setOptimized(optimizedRef.current);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      stopReasoningFeed();
      // 先让“处理中”优雅退场，再展示结果模块
      setProcessingVisible(false);
      setTimeout(() => {
        setProcessingMounted(false);
        if (optimizedRef.current) {
          setResultMounted(true);
          setTimeout(() => setResultVisible(true), 0);
        }
      }, 260);
    }
  }

  return (
    <div className="container">
      <div className="headerBar" style={{ marginBottom: 16 }}>
        <div className="logo">
          <div className="logoMark" />
          <div>
            <div className="title">提示词优化器</div>
            <div className="subtitle">使用 gpt-5（高阶推理）优化提示词 · 支持文生图与图生图</div>
          </div>
        </div>
        <div className="tabs" role="tablist" style={{ width: '100%', maxWidth: 320 }}>
          <button className={`tab ${tab==='txt2img' ? 'active':''}`} onClick={() => setTab('txt2img')}>文生图</button>
          <button className={`tab ${tab==='img2img' ? 'active':''}`} onClick={() => setTab('img2img')}>图生图</button>
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <div className="field">
            <label className="label">输入你的提示词</label>
            <textarea
              className="textarea"
              placeholder="描述主题、风格、构图、光照、色彩、细节、镜头、材质、分辨率等..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {tab === 'img2img' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label">上传参考图（PNG/JPG）</label>
              <input type="file" accept="image/*" className="file" onChange={onFileChange} />
              {filePreview && (
                <img src={filePreview} alt="预览" className="preview" style={{ marginTop: 8, maxHeight: 220 }} />
              )}
              <div className="helper">图生图会读取参考图的主体、风格与构成，结合你的提示词进行优化后再编辑生成。</div>
            </div>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label className="label">输出语言</label>
              <div className="actions">
                <button
                  type="button"
                  className={`button ${language==='en' ? '' : 'ghost'}`}
                  onClick={() => setLanguage('en')}
                >英文</button>
                <button
                  type="button"
                  className={`button ${language==='zh' ? '' : 'ghost'}`}
                  onClick={() => setLanguage('zh')}
                >中文</button>
              </div>
            </div>
            <div className="field">
              <label className="label">说明</label>
              <div className="badge">仅优化提示词，不生成/编辑图片</div>
            </div>
          </div>

          <div className="actions" style={{ marginTop: 16 }}>
            <button className="button" onClick={handleOptimizeAndRun} disabled={!canSubmit || loading}>
              {loading ? '处理中…' : '优化提示词'}
            </button>
            {optimized && (
              <button className="button ghost" onClick={() => navigator.clipboard.writeText(optimized)}>复制优化提示词</button>
            )}
          </div>
          {error && <div className="helper" style={{ color: '#ef4444', marginTop: 8 }}>{error}</div>}
        </section>

        {processingMounted && (
          <section className={`card ${processingVisible ? 'slide-up fade-in' : 'slide-down fade-out'}`}>
            <div className="field" style={{ gap: 12 }}>
              <label className="label">处理中（模型推理过程）</label>
              <div className="processingHeader">
                <div className="spinner" aria-hidden />
                <div className="helper">模型正在深度推理，请稍候…</div>
              </div>
              <div className="logs">
                {reasoningLogs.map((line, idx) => (
                  <div key={idx} className="logItem">{line}</div>
                ))}
                {reasoningLogs.length === 0 && (
                  <div className="helper">初始化推理中…</div>
                )}
              </div>
            </div>
          </section>
        )}

        {resultMounted && (
          <section className={`card ${resultVisible ? 'slide-up fade-in' : 'slide-down fade-out'}`}>
            <div className="field">
              <label className="label">优化后的提示词</label>
              <div className="optArea">{optimized}</div>
            </div>
          </section>
        )}
      </div>

      <div className="footer">Aihubmix · 基于 OpenAI API 代理 · 移动端已适配</div>
    </div>
  );
}


