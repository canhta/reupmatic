export const speechEn = {
  speechTitle: 'Local speech recognition',
  speechIntro: 'Create a timed transcript from the original video’s first audio stream. Review the result before replacing the transcript. Subtitles, translations and spoken text are not overwritten.',
  speechTimingHelp: 'CPU-only, segment timestamps on the source clock; not word alignment, speaker detection or dubbing. Choose up to two hours per request. The sample uses the start/end range in Render controls, not the edited output clock.',
  speechComposition: 'Recognition of a multi-clip composition is not connected. Recognize the original before creating the composition; existing text follows later composition edits.',
  speechNoAudio: 'The selected video has no audio stream. Import a transcript or choose a video with audio.',
  speechReady: 'Local bundle found. Every file is verified before each recognition request.',
  speechSetup: 'Local model setup',
  speechSetupHelp: 'Choose a prepared JSON manifest for local faster-whisper weights. The manifest must list supported languages and SHA-256 hashes for model, configuration, tokenizer and vocabulary files. Runtime packages must be installed separately; this action downloads nothing. See docs/development/local-speech.md in the source archive.',
  speechChooseManifest: 'Choose model manifest', speechModelId: 'Bundle identity:',
  speechVerifying: 'Checking local model files', speechLanguage: 'Language spoken in the source',
  speechScope: 'Recognition range', speechSample: 'Current sample range', speechFull: 'Full original video',
  speechStart: 'Recognize speech', speechDecoding: 'Preparing source audio', speechRecognizing: 'Recognizing speech',
  speechDraft: 'Transcript result — not applied',
  speechReplaceHelp: '{{count}} recognized cue(s). Applying replaces the entire transcript, including text outside this range; it never merges silently. Other layers remain unchanged and may be marked out of date. Undo restores the document.',
  speechResultInfo: '{{language}} · source {{start}}–{{end}} s · {{runtime}}',
  speechEmpty: 'No non-empty speech segments returned. Nothing has been replaced. Choose another range or check the source language.',
  speechStaleHelp: 'The document changed after this request. Review the comparison against the current transcript, then explicitly replace it. The result remains available.',
  speechReview: 'Review against current transcript', speechApply: 'Replace transcript', speechTime: 'Source time (seconds)',
  speechMissing: 'No local speech model is configured. Open Local model setup.',
  speechRuntimeMissing: 'The local recognition runtime is not installed. Install the optional speech dependencies in the worker environment.',
  speechModelChanged: 'The model bundle changed or failed verification. Restore its files or choose a verified manifest again.',
  speechLanguageMissing: 'This local model does not support the selected language. Select the correct language or another model; no fallback is used.',
  speechInvalid: 'Invalid recognition range, manifest or response. Check the selection; existing text is retained.',
  speechLimit: 'The request exceeds the two-hour or result-size safety limit. Choose a shorter range.',
  speechDiskLow: 'Not enough workspace space for temporary audio. Free space and retry.',
  speechFailed: 'Local recognition did not finish. Check the runtime and model, then retry; your document is retained.',
};
export const speechVi: Record<keyof typeof speechEn, string> = {
  speechTitle: 'Nhận dạng giọng nói cục bộ',
  speechIntro: 'Tạo bản chép lời có thời gian từ luồng âm thanh đầu tiên của video gốc. Duyệt kết quả trước khi thay bản chép lời. Không ghi đè phụ đề, bản dịch hoặc nội dung đọc.',
  speechTimingHelp: 'Chạy bằng CPU, mốc thời gian theo đoạn trên video nguồn; không căn từng từ, tách người nói hay lồng tiếng. Mỗi yêu cầu tối đa hai giờ. Mẫu dùng khoảng bắt đầu/kết thúc trong phần Render, không dùng đồng hồ bản xuất đã chỉnh.',
  speechComposition: 'Chưa nhận dạng trực tiếp tổ hợp nhiều clip. Nhận dạng video gốc trước khi ghép; văn bản đã có sẽ đi theo các lần chỉnh tổ hợp sau đó.',
  speechNoAudio: 'Video đã chọn không có luồng âm thanh. Nhập bản chép lời hoặc chọn video có âm thanh.',
  speechReady: 'Đã thấy bộ mô hình cục bộ. Mỗi lần nhận dạng đều kiểm tra lại từng file.',
  speechSetup: 'Cấu hình mô hình cục bộ',
  speechSetupHelp: 'Chọn manifest JSON đã chuẩn bị cho trọng số faster-whisper trên máy. Manifest phải khai báo ngôn ngữ và mã SHA-256 của model, cấu hình, tokenizer, từ vựng. Cần cài riêng thư viện chạy; thao tác này không tải gì. Xem docs/development/local-speech.md trong ZIP mã nguồn.',
  speechChooseManifest: 'Chọn manifest mô hình', speechModelId: 'Mã bộ mô hình:',
  speechVerifying: 'Đang kiểm tra file mô hình cục bộ', speechLanguage: 'Ngôn ngữ nói trong nguồn',
  speechScope: 'Phạm vi nhận dạng', speechSample: 'Khoảng mẫu hiện tại', speechFull: 'Toàn bộ video gốc',
  speechStart: 'Nhận dạng giọng nói', speechDecoding: 'Đang chuẩn bị âm thanh nguồn', speechRecognizing: 'Đang nhận dạng giọng nói',
  speechDraft: 'Kết quả chép lời — chưa áp dụng',
  speechReplaceHelp: '{{count}} câu nhận dạng. Áp dụng sẽ thay toàn bộ bản chép lời, kể cả nội dung ngoài khoảng này; không tự ghép ngầm. Các lớp khác giữ nguyên và có thể được đánh dấu cần cập nhật. Hoàn tác khôi phục tài liệu.',
  speechResultInfo: '{{language}} · nguồn {{start}}–{{end}} giây · {{runtime}}',
  speechEmpty: 'Không có đoạn lời nói chứa văn bản. Chưa thay nội dung nào. Chọn khoảng khác hoặc kiểm tra ngôn ngữ nguồn.',
  speechStaleHelp: 'Tài liệu đã thay đổi sau khi gửi yêu cầu. Duyệt bản so sánh với transcript hiện tại rồi xác nhận thay thế riêng. Kết quả vẫn được giữ.',
  speechReview: 'Duyệt với bản chép lời hiện tại', speechApply: 'Thay bản chép lời', speechTime: 'Thời gian nguồn (giây)',
  speechMissing: 'Chưa cấu hình mô hình nhận dạng cục bộ. Mở phần Cấu hình mô hình cục bộ.',
  speechRuntimeMissing: 'Chưa cài bộ thư viện nhận dạng cục bộ. Cài dependency giọng nói tùy chọn vào môi trường worker.',
  speechModelChanged: 'Bộ mô hình thay đổi hoặc không qua kiểm tra. Khôi phục file hoặc chọn lại manifest đã xác minh.',
  speechLanguageMissing: 'Mô hình không hỗ trợ ngôn ngữ đã chọn. Chọn đúng ngôn ngữ hoặc mô hình khác; không tự đổi ngôn ngữ.',
  speechInvalid: 'Khoảng nhận dạng, manifest hoặc kết quả không hợp lệ. Kiểm tra lựa chọn; văn bản hiện tại vẫn được giữ.',
  speechLimit: 'Yêu cầu vượt giới hạn hai giờ hoặc dung lượng kết quả. Chọn khoảng ngắn hơn.',
  speechDiskLow: 'Workspace không đủ chỗ cho âm thanh tạm. Giải phóng dung lượng rồi thử lại.',
  speechFailed: 'Nhận dạng cục bộ chưa hoàn tất. Kiểm tra thư viện và mô hình rồi thử lại; tài liệu vẫn được giữ.',
};
export function speechErrorKey(code: string): string {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'SOURCE_CHANGED' || code === 'SOURCE_MISSING') return 'sourceChanged';
  if (code === 'NO_AUDIO') return 'speechNoAudio';
  if (code === 'SPEECH_COMPOSITION_UNAVAILABLE') return 'speechComposition';
  if (code === 'STALE_OPERATION') return 'rulesStale';
  if (code === 'MODEL_MISSING') return 'speechMissing';
  if (code === 'MODEL_RUNTIME_MISSING') return 'speechRuntimeMissing';
  if (['SPEECH_MODEL_CHANGED', 'MODEL_CHANGED', 'MODEL_HASH_MISMATCH', 'MODEL_FILE_MISSING'].includes(code)) return 'speechModelChanged';
  if (code === 'MODEL_LANGUAGE_UNAVAILABLE') return 'speechLanguageMissing';
  if (code === 'SPEECH_LIMIT' || code === 'SPEECH_RESULT_TOO_LARGE') return 'speechLimit';
  if (code === 'SPEECH_DISK_LOW') return 'speechDiskLow';
  if (code === 'INVALID_REQUEST' || code.includes('INVALID')) return 'speechInvalid';
  return 'speechFailed';
}
