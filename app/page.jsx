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
  const abortRef = useRef(null);

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

  function stopReasoningFeed() {
    if (reasoningTimerRef.current) {
      clearInterval(reasoningTimerRef.current);
      reasoningTimerRef.current = null;
    }
  }

  function appendReasoning(text) {
    if (!text) return;
    setReasoningLogs((prev) => {
      const pieces = String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
      if (pieces.length === 0) return prev;
      const next = [...prev, ...pieces];
      return next.slice(-200); // 限制最多展示200行，避免过长
    });
  }

  async function streamSSE(url, options) {
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error('流式连接失败');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalText = '';

    function handleEvent(evt) {
      try {
        const data = JSON.parse(evt);
        const t = data.type || '';
        
        // 调试日志：记录所有事件类型和结构
        console.log('📨 前端收到事件:', {
          type: t,
          keys: Object.keys(data),
          data: data
        });
        
        // 处理输出文本增量
        if (t === 'response.output_text.delta' && typeof data.delta === 'string') {
          finalText += data.delta;
        }
        if (t === 'response.output_text.done') {
          // 输出文本完成
        }
        // 处理推理增量（根据 Aihubmix API 文档优化）
        if ((/reason/i).test(t)) {
          console.log('🧠 检测到推理事件:', t, data);
          
          // 处理 response.reasoning.delta 事件
          if (t === 'response.reasoning.delta' && typeof data.delta === 'string') {
            appendReasoning(data.delta);
          }
          // 处理 response.output_item.added 事件（类型为 reasoning）
          else if (t === 'response.output_item.added' && data.item?.type === 'reasoning') {
            if (Array.isArray(data.item.content)) {
              for (const c of data.item.content) {
                if (typeof c.text === 'string') {
                  appendReasoning(c.text);
                }
              }
            }
          }
          // 处理其他可能的推理事件格式
          else if (typeof data.delta === 'string') {
            appendReasoning(data.delta);
          } else if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item?.type === 'reasoning') {
                if (Array.isArray(item.summary) && item.summary.length) {
                  appendReasoning(item.summary.join('\n'));
                }
                if (Array.isArray(item.content)) {
                  for (const c of item.content) {
                    if (typeof c.text === 'string') appendReasoning(c.text);
                  }
                }
              }
            }
          } else if (data.reasoning && typeof data.reasoning === 'string') {
            appendReasoning(data.reasoning);
          }
        }
        // 额外处理可能包含推理内容的其他事件类型
        else if (t === 'response.output_item.added' && data.item) {
          const item = data.item;
          if (item.type === 'reasoning' || item.type === 'thinking') {
            console.log('🧠 发现推理内容:', item);
            if (Array.isArray(item.content)) {
              for (const c of item.content) {
                if (typeof c.text === 'string') {
                  appendReasoning(c.text);
                }
              }
            }
            if (typeof item.text === 'string') {
              appendReasoning(item.text);
            }
          }
        }
        if (t === 'response.error') {
          throw new Error(data.error?.message || '模型流式错误');
        }
        // 通用推理内容检测（作为备用方案）
        if (!(/reason/i).test(t) && t !== 'response.output_text.delta' && t !== 'response.output_text.done') {
          // 检查任何事件中是否包含推理相关的内容
          if (data.item && (data.item.type === 'reasoning' || data.item.type === 'thinking')) {
            console.log('🧠 通用检测发现推理内容:', data.item);
            if (Array.isArray(data.item.content)) {
              for (const c of data.item.content) {
                if (typeof c.text === 'string') {
                  appendReasoning(c.text);
                }
              }
            }
            if (typeof data.item.text === 'string') {
              appendReasoning(data.item.text);
            }
          }
          // 检查是否有任何 delta 包含推理内容
          if (typeof data.delta === 'string' && data.delta.trim()) {
            // 如果 delta 内容看起来像推理（包含常见推理词汇）
            const reasoningIndicators = ['思考', '分析', '考虑', 'thinking', 'analyzing', 'considering', '我需要', '让我'];
            const hasReasoningContent = reasoningIndicators.some(indicator => 
              data.delta.toLowerCase().includes(indicator.toLowerCase())
            );
            if (hasReasoningContent) {
              console.log('🧠 检测到疑似推理内容:', data.delta);
              appendReasoning(data.delta);
            }
          }
        }
        
        if (t === 'response.completed') {
          optimizedRef.current = finalText.trim();
        }
      } catch (e) {
        // 忽略无法解析的事件
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // 解析单个SSE事件
        const lines = rawEvent.split('\n');
        let dataLines = [];
        for (const line of lines) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length) {
          const payload = dataLines.join('\n');
          handleEvent(payload);
        }
      }
    }
    // 结束后返回最终文本
    return optimizedRef.current;
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
    setReasoningLogs([]);
    try {
      if (tab === 'txt2img') {
        const final = await streamSSE('/api/optimize-and-generate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, language }),
        });
        setOptimized(final);
      } else {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (file) form.append('image', file);
        const final = await streamSSE('/api/optimize-and-edit/stream', { method: 'POST', body: form });
        setOptimized(final);
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


