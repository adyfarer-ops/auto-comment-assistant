const videoExtractionService = require('../src/services/video-extraction-service');
const videoAnalysisService = require('../src/services/video-analysis-service');

const testUrls = [
  'https://www.tiktok.com/@idrila/video/7632162094288342285',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
];

(async () => {
  for (const url of testUrls) {
    console.log(`\n=== Testing ${url.slice(0, 60)}... ===`);
    try {
      const extracted = await videoExtractionService.extractVideoUrl(url);
      console.log('✅ Extraction success');
      console.log('  Title:', extracted.title?.slice(0, 50));
      console.log('  Video URL:', extracted.videoUrl?.slice(0, 80));
      console.log('  Cover URL:', extracted.coverUrl?.slice(0, 80));
      console.log('  Platform:', extracted.platform);
      console.log('  Duration:', extracted.duration);

      if (extracted.videoUrl) {
        console.log('\n  Analyzing video...');
        try {
          const analysis = await videoAnalysisService.analyzeVideoDirect(extracted.videoUrl, {
            prompt: '请分析这个短视频的画面风格、主要元素、节奏感、氛围，并给出内容运营建议。',
          });
          console.log('✅ Analysis success');
          console.log('  Analysis:', analysis.slice(0, 200) + '...');
        } catch (ae) {
          console.log('❌ Analysis failed:', ae.message);
        }
      }
    } catch (e) {
      console.log('❌ Extraction failed:', e.message);
    }
  }
})();
