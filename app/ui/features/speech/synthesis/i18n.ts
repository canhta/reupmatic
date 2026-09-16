export const synthesisEn = {
  synthesisTitle: 'Local voice generation',
  synthesisIntro: 'Generate a separate audio draft from spoken text. Listen and review before saving. No subtitle, transcript, translation, soundtrack or project content is changed.',
  synthesisLimits: 'CPU only · 1–100 non-empty cues · 300 characters per cue · 20 KB text per request. Natural sequential speech with 250 ms between cues; source times are references, not alignment. No automatic speed fitting or mixing.',
  synthesisReady: 'Local bundle found. Each run rechecks its hashes. Availability does not prove voice quality or complete pronunciation.',
  synthesisSetup: 'Local voice model setup',
  synthesisSetupHelp: 'Choose a prepared VieNeu v3 Turbo ONNX FP32 bundle with checksum-pinned preset voices. Install worker/requirements-synthesis.txt separately. No downloads, cloud fallback or voice cloning. See docs/development/local-synthesis.md.',
  synthesisLanguage: 'Declared spoken language',
  synthesisLanguageHelp: 'The SDK uses its bilingual Vietnamese–English normalizer. This declaration checks the spoken layer and model; it is not an accent or pronunciation lock.',
  synthesisVoice: 'Preset voice', synthesisChooseVoice: 'Choose a configured voice',
  synthesisScope: 'Cues to generate', synthesisAll: 'All spoken cues', synthesisSelected: 'Selected spoken cue only',
  synthesisSelectionHelp: 'For a single-cue sample, select the spoken layer and select a cue in the existing editor.',
  synthesisStart: 'Generate audio draft', synthesisRunning: 'Generating speech',
  synthesisDraft: 'Generated voice — not aligned or added to video',
  synthesisCaptured: '{{language}} · voice {{voice}} · {{count}} cue(s) · {{duration}} s · {{runtime}}',
  synthesisSession: 'This review is session-only, not part of project recovery. Save the WAV and JSON receipt before closing the document. A failed retry keeps the previous successful draft.',
  synthesisComparison: 'Captured words and actual generated timing', synthesisWords: 'Captured spoken text',
  synthesisSourceTime: 'Requested source time (s)', synthesisActualTime: 'Audio time (s)',
  synthesisDuration: 'Actual / requested duration (s)',
  synthesisListen: 'Verify and listen', synthesisPlayer: 'Generated speech draft audio',
  synthesisReviewed: 'I checked the captured text and listened for missing words, pronunciation and unwanted sounds.',
  synthesisSaveWav: 'Save reviewed WAV', synthesisSaveReceipt: 'Save JSON receipt',
  synthesisReceiptHelp: 'The receipt contains spoken text, source times, audio frame spans, voice/model identity and WAV SHA-256. Treat it as private content. WAV and receipt are saved separately.',
  synthesisVerifyingArtifact: 'Verifying the captured audio artifact',
  synthesisSaving: 'Saving the captured audio draft', synthesisSaved: 'Saved {{name}}',
  synthesisStale: 'Spoken text, timing, language or its source changed. The old draft record remains visible for comparison, but its audio cannot be auditioned or saved as current. Review the spoken layer and generate again.',
  synthesisMissing: 'No local voice model is configured. Open model setup to choose a prepared bundle.',
  synthesisRuntime: 'The required voice runtime is unavailable or has a different SDK version. Install worker/requirements-synthesis.txt in the worker environment.',
  synthesisVoiceMissing: 'Choose a voice and language declared by the configured bundle. No substitute voice is selected by the worker.',
  synthesisLanguageMismatch: 'The spoken layer declares another language. Check its content and choose the matching language.',
  synthesisModelChanged: 'Model files or voice data changed or failed checksum verification. Restore the bundle or configure a verified manifest again.',
  synthesisLimit: 'A request, phoneme, audio or session limit was exceeded. Use a selected cue or shorten the spoken segments and retry; no partial result is accepted.',
  synthesisInvalid: 'The request, voice bundle or generated audio is invalid. Check the configuration and regenerate. Existing text is unchanged.',
  synthesisDisk: 'Not enough workspace space for speech generation. Free space and retry.',
  synthesisProtected: 'That destination is protected or changed during saving. Choose a different output file; originals and live drafts are retained.',
  synthesisExtension: 'Choose a .wav filename for audio or a .json filename for the receipt.',
  synthesisNetwork: 'The SDK attempted a network connection or another process. The attempt was blocked; prepare the complete supported local runtime and bundle.',
  synthesisFailed: 'Voice generation or saving did not finish. Check the runtime and model, then retry. Existing text and the previous successful draft are retained.',
};
export const synthesisVi: Record<keyof typeof synthesisEn, string> = {
  synthesisTitle: 'Tạo giọng nói cục bộ',
  synthesisIntro: 'Tạo bản nháp âm thanh riêng từ nội dung đọc. Nghe và duyệt trước khi lưu. Không thay phụ đề, bản chép lời, bản dịch, nhạc nền hay nội dung dự án.',
  synthesisLimits: 'Chỉ CPU · 1–100 câu không trống · 300 ký tự mỗi câu · 20 KB văn bản mỗi yêu cầu. Đọc nối tiếp tự nhiên, nghỉ 250 ms giữa các câu; mốc nguồn chỉ để đối chiếu, chưa căn thời gian. Không tự ép tốc độ hay trộn âm thanh.',
  synthesisReady: 'Đã thấy bộ mô hình cục bộ. Mỗi lần chạy đều kiểm tra lại hash. Trạng thái sẵn sàng không chứng minh chất lượng giọng hay đọc đủ nội dung.',
  synthesisSetup: 'Cấu hình mô hình giọng nói cục bộ',
  synthesisSetupHelp: 'Chọn bộ VieNeu v3 Turbo ONNX FP32 đã chuẩn bị với giọng có sẵn được ghim checksum. Cài riêng worker/requirements-synthesis.txt. Không tải mô hình, chuyển sang đám mây hay nhân bản giọng. Xem docs/development/local-synthesis.md.',
  synthesisLanguage: 'Ngôn ngữ khai báo của nội dung đọc',
  synthesisLanguageHelp: 'SDK dùng bộ chuẩn hóa song ngữ Việt–Anh. Khai báo này đối chiếu lớp nội dung đọc với mô hình, không khóa giọng vùng miền hay cách phát âm.',
  synthesisVoice: 'Giọng có sẵn', synthesisChooseVoice: 'Chọn giọng đã cấu hình',
  synthesisScope: 'Các câu cần tạo giọng', synthesisAll: 'Toàn bộ lớp nội dung đọc', synthesisSelected: 'Chỉ câu nội dung đọc đang chọn',
  synthesisSelectionHelp: 'Để thử một câu, chọn lớp nội dung đọc rồi chọn câu trong bảng biên tập hiện có.',
  synthesisStart: 'Tạo bản nháp âm thanh', synthesisRunning: 'Đang tạo giọng nói',
  synthesisDraft: 'Giọng đã tạo — chưa căn thời gian hay thêm vào video',
  synthesisCaptured: '{{language}} · giọng {{voice}} · {{count}} câu · {{duration}} giây · {{runtime}}',
  synthesisSession: 'Bản duyệt chỉ thuộc phiên làm việc, không nằm trong phục hồi dự án. Lưu WAV và hồ sơ JSON trước khi đóng tài liệu. Lần thử lại thất bại vẫn giữ bản nháp thành công trước đó.',
  synthesisComparison: 'Đối chiếu nội dung đã chụp và thời gian âm thanh thực tế', synthesisWords: 'Nội dung đọc đã chụp',
  synthesisSourceTime: 'Mốc thời gian nguồn (giây)', synthesisActualTime: 'Mốc trong âm thanh (giây)',
  synthesisDuration: 'Thời lượng thực tế / yêu cầu (giây)',
  synthesisListen: 'Xác minh và nghe', synthesisPlayer: 'Âm thanh bản nháp giọng đọc',
  synthesisReviewed: 'Tôi đã đối chiếu nội dung và nghe kiểm tra thiếu từ, phát âm và âm thanh không mong muốn.',
  synthesisSaveWav: 'Lưu WAV đã duyệt', synthesisSaveReceipt: 'Lưu hồ sơ JSON',
  synthesisReceiptHelp: 'Hồ sơ chứa nội dung đọc, mốc nguồn, khoảng mẫu âm thanh, định danh giọng/mô hình và SHA-256 của WAV. Đây là nội dung riêng tư. WAV và hồ sơ được lưu riêng.',
  synthesisVerifyingArtifact: 'Đang xác minh tệp âm thanh đã chụp',
  synthesisSaving: 'Đang lưu bản giọng đọc đã chụp', synthesisSaved: 'Đã lưu {{name}}',
  synthesisStale: 'Nội dung đọc, thời gian, ngôn ngữ hoặc nguồn đã thay đổi. Hồ sơ bản nháp cũ còn hiển thị để đối chiếu, nhưng không nghe hay lưu âm thanh như bản hiện hành. Duyệt lại lớp nội dung đọc rồi tạo giọng mới.',
  synthesisMissing: 'Chưa cấu hình mô hình giọng nói cục bộ. Mở cấu hình để chọn bộ mô hình đã chuẩn bị.',
  synthesisRuntime: 'Thiếu thư viện chạy giọng nói hoặc khác phiên bản SDK yêu cầu. Cài worker/requirements-synthesis.txt trong môi trường worker.',
  synthesisVoiceMissing: 'Chọn giọng và ngôn ngữ được bộ mô hình khai báo. Worker không tự thay giọng khác.',
  synthesisLanguageMismatch: 'Lớp nội dung đọc khai báo ngôn ngữ khác. Kiểm tra nội dung rồi chọn ngôn ngữ khớp.',
  synthesisModelChanged: 'Tệp mô hình hoặc dữ liệu giọng đã đổi hoặc sai checksum. Khôi phục bộ mô hình hoặc chọn lại manifest đã xác minh.',
  synthesisLimit: 'Vượt giới hạn yêu cầu, phiên âm, âm thanh hoặc phiên làm việc. Thử một câu hoặc rút ngắn nội dung rồi chạy lại; không chấp nhận kết quả dang dở.',
  synthesisInvalid: 'Yêu cầu, bộ giọng hoặc âm thanh tạo ra không hợp lệ. Kiểm tra cấu hình rồi tạo lại. Văn bản hiện có không thay đổi.',
  synthesisDisk: 'Workspace không đủ chỗ để tạo giọng nói. Giải phóng dung lượng rồi thử lại.',
  synthesisProtected: 'Đích lưu được bảo vệ hoặc đã thay đổi trong lúc lưu. Chọn tệp đầu ra khác; giữ nguyên tệp gốc và bản nháp đang dùng.',
  synthesisExtension: 'Chọn tên có đuôi .wav cho âm thanh hoặc .json cho hồ sơ.',
  synthesisNetwork: 'SDK đã thử kết nối mạng hoặc tạo tiến trình khác. Đã chặn thao tác; hãy chuẩn bị đầy đủ thư viện và bộ mô hình cục bộ được hỗ trợ.',
  synthesisFailed: 'Chưa tạo hoặc lưu xong giọng nói. Kiểm tra thư viện và mô hình rồi thử lại. Văn bản hiện có và bản nháp thành công trước đó vẫn được giữ.',
};
export function synthesisErrorKey(code: string): string {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'MODEL_MISSING') return 'synthesisMissing';
  if (['MODEL_RUNTIME_MISSING', 'SYNTHESIS_RUNTIME_VERSION'].includes(code)) return 'synthesisRuntime';
  if (['MODEL_HASH_MISMATCH', 'SYNTHESIS_MODEL_CHANGED'].includes(code)) return 'synthesisModelChanged';
  if (['MODEL_LANGUAGE_UNAVAILABLE', 'SYNTHESIS_VOICE_UNAVAILABLE'].includes(code)) return 'synthesisVoiceMissing';
  if (code === 'SYNTHESIS_LANGUAGE_MISMATCH') return 'synthesisLanguageMismatch';
  if (['STALE_OPERATION', 'TEXT_LAYER_STALE'].includes(code)) return 'synthesisStale';
  if (code === 'TEXT_LAYER_EMPTY') return 'textLayerEmpty';
  if (code.includes('LIMIT')) return 'synthesisLimit';
  if (code === 'SYNTHESIS_DISK_LOW') return 'synthesisDisk';
  if (code === 'SOURCE_OVERWRITE' || code.startsWith('OUTPUT_')) return 'synthesisProtected';
  if (code === 'SYNTHESIS_EXPORT_EXTENSION') return 'synthesisExtension';
  if (code === 'MODEL_NETWORK_DISABLED') return 'synthesisNetwork';
  if (code.includes('INVALID') || code === 'UNKNOWN_ARTIFACT') return 'synthesisInvalid';
  return 'synthesisFailed';
}
