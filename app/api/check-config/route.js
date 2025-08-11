import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.AIHUBMIX_API_KEY;
    
    console.log('🔧 检查配置:');
    console.log('- API Key存在:', !!apiKey);
    console.log('- API Key前缀:', apiKey ? apiKey.substring(0, 10) + '...' : 'N/A');
    console.log('- 环境变量:', Object.keys(process.env).filter(k => k.includes('AIHUB')));

    if (!apiKey) {
      return NextResponse.json({ 
        error: '缺少 AIHUBMIX_API_KEY 环境变量',
        hasApiKey: false
      }, { status: 400 });
    }

    // 测试简单的API调用
    const testEndpoints = [
      'https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash:generateContent',
      'https://aihubmix.com/gemini/v1/models/gemini-2.5-flash:generateContent',
      'https://aihubmix.com/gemini/models/gemini-2.5-flash:generateContent'
    ];

    const testResults = [];

    for (const endpoint of testEndpoints) {
      console.log(`🧪 测试端点: ${endpoint}`);
      
      try {
        const testBody = {
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [{ text: "Hello" }]
            }
          ]
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(testBody),
        });

        const result = {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        };

        if (!response.ok) {
          const errorText = await response.text();
          result.error = errorText;
        } else {
          result.success = true;
        }

        testResults.push(result);
        console.log(`📊 测试结果: ${endpoint} -> ${response.status}`);

      } catch (err) {
        testResults.push({
          endpoint,
          error: err.message,
          type: 'fetch_error'
        });
        console.error(`❌ 端点测试失败: ${endpoint}`, err.message);
      }
    }

    return NextResponse.json({
      hasApiKey: true,
      apiKeyPrefix: apiKey.substring(0, 10) + '...',
      testResults,
      environment: process.env.NODE_ENV
    });

  } catch (err) {
    console.error('配置检查错误:', err);
    return NextResponse.json({ 
      error: err.message,
      hasApiKey: !!process.env.AIHUBMIX_API_KEY 
    }, { status: 500 });
  }
}
