"use client";

import { useMemo, useState } from 'react';

export default function HomePage() {
  const [tab, setTab] = useState('txt2img');
  const [prompt, setPrompt] = useState('');
  const [optimized, setOptimized] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');

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

  async function handleOptimizeAndRun() {
    setLoading(true);
    setError('');
    setOptimized('');
    try {
      if (tab === 'txt2img') {
        const res = await fetch('/api/optimize-and-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, language }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        setOptimized(data.optimizedPrompt || '');
      } else {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('language', language);
        if (file) form.append('image', file);
        const res = await fetch('/api/optimize-and-edit', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        setOptimized(data.optimizedPrompt || '');
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
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

        <section className="card">
          <div className="field">
            <label className="label">优化后的提示词</label>
            <div className="optArea">{optimized || '提交后将在此显示 gpt-5（高阶推理）优化的提示词。'}</div>
          </div>

          
        </section>
      </div>

      <div className="footer">Aihubmix · 基于 OpenAI API 代理 · 移动端已适配</div>
    </div>
  );
}


