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
  // 首尾帧视频功能状态
  const [firstFrame, setFirstFrame] = useState(null);
  const [lastFrame, setLastFrame] = useState(null);
  const [firstFramePreview, setFirstFramePreview] = useState('');
  const [lastFramePreview, setLastFramePreview] = useState('');
  const [processingMounted, setProcessingMounted] = useState(false);
  const [processingVisible, setProcessingVisible] = useState(false);
  const [reasoningLogs, setReasoningLogs] = useState([]);
  const [resultMounted, setResultMounted] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [progress, setProgress] = useState(0);
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
    if ((tab === 'img2img' || tab === 'img2video') && !file) return false;
    if (tab === 'frame2video' && (!firstFrame || !lastFrame)) return false;
    return true;
  }, [prompt, tab, file, firstFrame, lastFrame]);

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

  function onFirstFrameChange(e) {
    const f = e.target.files?.[0];
    setFirstFrame(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setFirstFramePreview(url);
    } else {
      setFirstFramePreview('');
    }
  }

  function onLastFrameChange(e) {
    const f = e.target.files?.[0];
    setLastFrame(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setLastFramePreview(url);
    } else {
      setLastFramePreview('');
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

  // 文生图虚拟推理步骤
  const txt2imgReasoningSteps = [
    '解析文本描述的语义内容...',
    '识别核心主题与创作意图...',
    '分析艺术风格与视觉特征...',
    '构建场景元素与空间关系...',
    '评估色彩搭配与光影效果...',
    '优化构图与视角描述...',
    '增强细节表现与质感描述...',
    '调整艺术参数与技术规格...',
    '整合创意元素形成完整视觉概念...',
    '生成高质量文生图提示词...',
    '完成文本到图像的转换优化...'
  ];

  // 图生图虚拟推理步骤
  const img2imgReasoningSteps = [
    '加载并分析上传的原始图像...',
    '识别图像主要元素与构图结构...',
    '解析图像风格与色彩特征...',
    '理解文本修改指令的具体要求...',
    '分析图文融合的可行性方案...',
    '规划图像变换与保留策略...',
    '优化修改指令的精确表达...',
    '调整变换参数与控制强度...',
    '整合原图特征与新增元素...',
    '生成精确的图生图提示词...',
    '完成基于图像的智能优化...'
  ];

  // 文生视频虚拟推理步骤
  const txt2videoReasoningSteps = [
    '解析文本描述的动态场景内容...',
    '识别核心主题与动作序列...',
    '分析视频风格与视觉特征...',
    '构建时间轴与镜头运动...',
    '评估色彩搭配与光影变化...',
    '优化动作描述与节奏控制...',
    '增强细节表现与质感描述...',
    '调整视频参数与技术规格...',
    '整合动态元素形成完整视觉概念...',
    '生成高质量文生视频提示词...',
    '完成文本到视频的转换优化...'
  ];

  // 图生视频虚拟推理步骤
  const img2videoReasoningSteps = [
    '加载并分析上传的原始图像...',
    '识别图像主要元素与静态构图...',
    '解析图像风格与色彩基调...',
    '理解文本动画指令的具体要求...',
    '分析图像到视频的动态转换方案...',
    '规划动作序列与保留策略...',
    '优化动画指令的精确表达...',
    '调整动态参数与运动强度...',
    '整合静态特征与动态元素...',
    '生成精确的图生视频提示词...',
    '完成基于图像的视频智能优化...'
  ];

  // 首尾帧视频虚拟推理步骤
  const frame2videoReasoningSteps = [
    '加载并分析首帧图片内容...',
    '加载并分析尾帧图片内容...',
    '识别两张图片的主要元素差异...',
    '分析场景、光照、色彩的变化...',
    '检测主体位置和形态的变化...',
    '构建合理的过渡路径...',
    '设计中间关键帧的状态...',
    '优化动作序列和时间节奏...',
    '整合用户提示词要求...',
    '生成连贯的过渡描述...',
    '完成首尾帧过渡提示词优化...'
  ];

  function startFakeReasoning() {
    setProgress(0);
    setReasoningLogs([]);
    let stepIndex = 0;
    let currentProgress = 0;
    
    // 根据当前模式选择相应的推理步骤
    let currentSteps;
    switch(tab) {
      case 'txt2img':
        currentSteps = txt2imgReasoningSteps;
        break;
      case 'img2img':
        currentSteps = img2imgReasoningSteps;
        break;
      case 'txt2video':
        currentSteps = txt2videoReasoningSteps;
        break;
      case 'img2video':
        currentSteps = img2videoReasoningSteps;
        break;
      case 'frame2video':
        currentSteps = frame2videoReasoningSteps;
        break;
      default:
        currentSteps = txt2imgReasoningSteps;
    }
    
    const simulate = () => {
      if (stepIndex < currentSteps.length) {
        appendReasoning(currentSteps[stepIndex]);
        stepIndex++;
        
        // 随机增加进度
        const increment = Math.random() * 15 + 5; // 5-20%
        currentProgress = Math.min(currentProgress + increment, 95);
        setProgress(currentProgress);
        
        // 随机延迟 300-800ms
        const delay = Math.random() * 500 + 300;
        reasoningTimerRef.current = setTimeout(simulate, delay);
      } else {
        // 完成进度
        setProgress(100);
        let completionMessage;
        switch(tab) {
          case 'txt2img':
            completionMessage = '文生图推理完成，正在生成结果...';
            break;
          case 'img2img':
            completionMessage = '图生图推理完成，正在生成结果...';
            break;
          case 'txt2video':
            completionMessage = '文生视频推理完成，正在生成结果...';
            break;
          case 'img2video':
            completionMessage = '图生视频推理完成，正在生成结果...';
            break;
          case 'frame2video':
            completionMessage = '首尾帧视频推理完成，正在生成结果...';
            break;
          default:
            completionMessage = '推理完成，正在生成结果...';
        }
        appendReasoning(completionMessage);
      }
    };
    
    simulate();
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
        
        // 处理输出文本增量
        if (t === 'response.output_text.delta' && typeof data.delta === 'string') {
          finalText += data.delta;
        }
        if (t === 'response.output_text.done') {
          // 输出文本完成
        }
        if (t === 'response.error') {
          throw new Error(data.error?.message || '模型流式错误');
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
    setProgress(0);
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
    
    // 开始虚拟推理过程
    startFakeReasoning();
    
    try {
      let final;
      if (tab === 'txt2img') {
        final = await streamSSE('/api/optimize-and-generate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, language }),
        });
      } else if (tab === 'txt2video') {
        final = await streamSSE('/api/optimize-and-generate-video/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, language }),
        });
      } else if (tab === 'img2img') {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (file) form.append('image', file);
        final = await streamSSE('/api/optimize-and-edit/stream', { method: 'POST', body: form });
      } else if (tab === 'img2video') {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (file) form.append('image', file);
        final = await streamSSE('/api/optimize-and-edit-video/stream', { method: 'POST', body: form });
      } else if (tab === 'frame2video') {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (firstFrame) form.append('firstFrame', firstFrame);
        if (lastFrame) form.append('lastFrame', lastFrame);
        final = await streamSSE('/api/optimize-frame-transition/stream', { method: 'POST', body: form });
      }
      
      // 确保进度条完成
      setProgress(100);
      // 稍微延迟显示结果，让用户看到完成状态
      setTimeout(() => {
        setOptimized(final);
      }, 500);
      
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      stopReasoningFeed();
      // 先让"处理中"优雅退场，再展示结果模块
      setProcessingVisible(false);
      setTimeout(() => {
        setProcessingMounted(false);
        if (optimizedRef.current) {
          setResultMounted(true);
          setTimeout(() => setResultVisible(true), 0);
        }
      }, 1000); // 稍微延长时间让推理过程完整显示
    }
  }

  return (
    <div className="app-container">
      {/* 顶部切换滑块 */}
      <div className="top-switcher">
        <div className="switcher-container">
          <div className="switcher-track">
            <div 
              className="switcher-indicator"
              style={{
                transform: `translateX(${tab === 'txt2img' ? '0%' : tab === 'img2img' ? '100%' : tab === 'txt2video' ? '200%' : tab === 'img2video' ? '300%' : '400%'})`
              }}
            />
            <button 
              className={`switcher-option ${tab === 'txt2img' ? 'active' : ''}`} 
              onClick={() => setTab('txt2img')}
            >
              文生图
            </button>
            <button 
              className={`switcher-option ${tab === 'img2img' ? 'active' : ''}`} 
              onClick={() => setTab('img2img')}
            >
              图生图
            </button>
            <button 
              className={`switcher-option ${tab === 'txt2video' ? 'active' : ''}`} 
              onClick={() => setTab('txt2video')}
            >
              文生视频
            </button>
            <button 
              className={`switcher-option ${tab === 'img2video' ? 'active' : ''}`} 
              onClick={() => setTab('img2video')}
            >
              图生视频
            </button>
            <button 
              className={`switcher-option ${tab === 'frame2video' ? 'active' : ''}`} 
              onClick={() => setTab('frame2video')}
            >
              首尾帧视频
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="headerBar" style={{ marginBottom: 32 }}>
          <div className="logo">
            <div className="logoMark" />
            <div>
              <div className="title">提示词优化器</div>
              <div className="subtitle">使用 Gemini 2.5 Flash（高阶推理）优化提示词 · 支持文生图、图生图、文生视频、图生视频</div>
            </div>
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

          {(tab === 'img2img' || tab === 'img2video') && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label">上传参考图（PNG/JPG）</label>
              <input type="file" accept="image/*" className="file" onChange={onFileChange} />
              {filePreview && (
                <img src={filePreview} alt="预览" className="preview" style={{ marginTop: 8, maxHeight: 220 }} />
              )}
              <div className="helper">
                {tab === 'img2img' 
                  ? '图生图会读取参考图的主体、风格与构成，结合你的提示词进行优化后再编辑生成。'
                  : '图生视频会读取参考图的主体、风格与构成，结合你的提示词进行优化后生成动态视频。'
                }
              </div>
            </div>
          )}

          {tab === 'frame2video' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label">上传首尾帧图片（PNG/JPG）</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: 8 }}>
                <div>
                  <label className="label" style={{ fontSize: '14px', marginBottom: 4 }}>首帧</label>
                  <input type="file" accept="image/*" className="file" onChange={onFirstFrameChange} />
                  {firstFramePreview && (
                    <img src={firstFramePreview} alt="首帧预览" className="preview" style={{ marginTop: 8, maxHeight: 200, width: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div>
                  <label className="label" style={{ fontSize: '14px', marginBottom: 4 }}>尾帧</label>
                  <input type="file" accept="image/*" className="file" onChange={onLastFrameChange} />
                  {lastFramePreview && (
                    <img src={lastFramePreview} alt="尾帧预览" className="preview" style={{ marginTop: 8, maxHeight: 200, width: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              </div>
              <div className="helper" style={{ marginTop: 8 }}>
                首尾帧视频会分析两张图片的差异，生成描述过渡过程的视频提示词。请上传代表视频开始和结束状态的关键帧图片。
              </div>
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
              <div className="badge">
                {tab === 'txt2img' || tab === 'img2img' 
                  ? '仅优化提示词，不生成/编辑图片'
                  : tab === 'frame2video'
                  ? '仅优化提示词，不生成视频'
                  : '仅优化提示词，不生成/编辑视频'
                }
              </div>
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
              
              {/* 进度条 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ 
                  width: '100%', 
                  height: '8px', 
                  backgroundColor: '#f1f5f9', 
                  borderRadius: '4px', 
                  overflow: 'hidden' 
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-out'
                  }} />
                </div>
                <div className="helper" style={{ marginTop: 4, fontSize: '12px', color: '#64748b' }}>
                  推理进度: {Math.round(progress)}%
                </div>
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

    <div className="footer">Aihubmix · 基于 Gemini API 代理 · 移动端已适配</div>
      </div>
    </div>
  );
}


