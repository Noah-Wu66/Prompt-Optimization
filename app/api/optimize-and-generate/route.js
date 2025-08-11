import { NextResponse } from 'next/server';
import { genai, types } from 'google-genai';

function createClient() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return genai.Client({
    api_key: apiKey,
    http_options: { base_url: "https://aihubmix.com/gemini" }
  });
}

function extractTextFromResponse(response) {
  console.log('🔍 开始提取Gemini响应文本...');
  
  if (!response) {
    console.log('❌ 响应为空');
    return '';
  }
  
  console.log('🔍 响应类型:', typeof response);
  
  // 尝试从candidates中提取文本
  if (response.candidates && Array.isArray(response.candidates)) {
    console.log('🔍 检查candidates数组，长度:', response.candidates.length);
    for (let i = 0; i < response.candidates.length; i++) {
      const candidate = response.candidates[i];
      console.log(`🔍 处理candidates[${i}]:`, typeof candidate);
      
      if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
        console.log(`🔍 检查候选项${i}的parts数组，长度:`, candidate.content.parts.length);
        let texts = [];
        for (const part of candidate.content.parts) {
          if (part.text && !part.thought) { // 只取最终答案文本，不取思考过程
            console.log('✅ 找到文本内容:', part.text.substring(0, 50) + '...');
            texts.push(part.text);
          }
        }
        if (texts.length > 0) {
          const result = texts.join('').trim();
          console.log('✅ 成功提取文本，长度:', result.length);
          return result;
        }
      }
    }
  }
  
  // 检查是否有直接的text字段
  if (response.text && typeof response.text === 'string') {
    console.log('✅ 从text字段找到文本:', response.text.substring(0, 50) + '...');
    return response.text.trim();
  }
  
  console.log('❌ 未能从Gemini响应中提取到文本内容');
  console.log('🔍 响应对象所有键:', Object.keys(response));
  
  return '';
}

export async function POST(req) {
  try {
    console.log('=== 开始处理文生图优化请求（Gemini） ===');
    
    const { prompt, language = 'en' } = await req.json();
    console.log('请求参数:', { prompt: prompt?.substring(0, 100) + '...', language });
    
    if (!prompt || typeof prompt !== 'string') {
      console.log('❌ 提示词验证失败:', prompt);
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    console.log('✅ 提示词验证通过，长度:', prompt.length);

    const client = createClient();
    console.log('✅ Gemini 客户端创建成功');

    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。请将以下提示词优化为面向通用 AI 图像生成模型的高质量 ${outputLang} Prompt，要求：
- 用简洁清晰的结构描述主体、场景、造型、构图、镜头、光照、材质、配色、风格、后期等；
- 使用逗号分隔短语，避免长句；
- 尽量补全缺失但常见且合理的细节；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：
${prompt}`;

    console.log('📝 构建的优化输入:', optimizeInput.substring(0, 200) + '...');

    const model = "gemini-2.5-flash";
    const contents = [
      types.Content({
        role: "user",
        parts: [
          types.Part.from_text({ text: optimizeInput }),
        ],
      }),
    ];

    const generateContentConfig = types.GenerateContentConfig({
      thinking_config: types.ThinkingConfig({
        thinking_budget: 16384, // 使用最高推理预算
      }),
    });

    console.log('🚀 开始调用 Gemini API...');
    const response = await client.models.generate_content({
      model: model,
      contents: contents,
      config: generateContentConfig,
    });
    console.log('✅ API调用完成');

    // 调试日志：打印响应结构
    console.log('📥 完整API响应:', JSON.stringify(response, null, 2));
    console.log('📥 响应类型:', typeof response);
    console.log('📥 响应键:', Object.keys(response || {}));

    const optimizedPrompt = extractTextFromResponse(response) || '';
    
    // 调试日志：打印提取的结果
    console.log('🔍 提取的优化提示词:', optimizedPrompt);
    console.log('🔍 提取结果长度:', optimizedPrompt.length);
    console.log('🔍 是否使用回退:', optimizedPrompt ? '否' : '是，使用原提示词');

    const finalResult = optimizedPrompt || prompt;
    console.log('📤 最终返回结果:', finalResult.substring(0, 100) + '...');
    console.log('=== 请求处理完成 ===');

    return NextResponse.json({ optimizedPrompt: finalResult, language });
  } catch (err) {
    console.error('❌ API调用出错:', err);
    console.error('❌ 错误详情:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}