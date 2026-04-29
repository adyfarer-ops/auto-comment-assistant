const videoAnalysisService = require('../src/services/video-analysis-service');

const testUrl = 'https://v16.tokcdn.com/4f1392c4474260198c998d1c89284edc/69eab280/7632162094288342285_original.mp4';

(async () => {
  console.log('Testing analyzeVideo with local download + keyframes...');
  try {
    const result = await videoAnalysisService.analyzeVideo(testUrl, {
      prompt: '请分析这个短视频的画面风格、主要元素、节奏感、氛围，并给出内容运营建议。',
      maxFrames: 3,
    });
    console.log('✅ Success');
    console.log('Keyframes:', result.keyframes);
    console.log('Analysis:', result.analysis?.slice(0, 300) + '...');
  } catch (e) {
    console.log('❌ Failed:', e.message);
  }
})();
