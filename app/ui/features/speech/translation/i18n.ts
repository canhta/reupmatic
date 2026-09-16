export const translationEn = {
  translationTitle: 'Local translation',
  translationIntro:
    'Translate the transcript or displayed subtitles into a separate draft. Only an explicit reviewed application changes translated text; spoken text and displayed subtitles are never replaced automatically.',
  translationLimits:
    'CPU only. Up to 500 non-empty cues and 100 KB of source text per request; long segments are rejected rather than truncated. Source timestamps are retained. This is not voice generation or timing alignment.',
  translationReady:
    'Local bundle found. Files are reverified before every translation; availability is not a quality guarantee.',
  translationSetup: 'Local translation model setup',
  translationSetupHelp:
    'Choose a JSON manifest for a prepared bilingual CTranslate2/SentencePiece bundle. Install the optional runtime separately. Nothing is downloaded. See docs/development/local-translation.md for the supported bundle and SHA-256 format.',
  translationSource: 'Source layer',
  translationFrom: 'Source language',
  translationTo: 'Target language',
  translationPairMissing:
    'The configured bundle does not match this language direction. Select its declared pair or configure a different bundle; no fallback is used.',
  translationLanguageMismatch:
    'The source layer’s declared language differs from this request. Check the text and choose its correct source language.',
  translationRules: 'Literal replacements after translation',
  translationRulesHelp:
    'Optional, ordered, case-sensitive replacements on the generated target text only. No regular expressions or model glossary. Up to 50 rules, 256 characters per field. A blank replacement deletes matching text; blank output is rejected.',
  translationRuleFind: 'Rule {{number}}: find',
  translationRuleReplace: 'Rule {{number}}: replace with',
  translationRuleRemove: 'Remove rule {{number}}',
  translationRuleAdd: 'Add replacement',
  translationStart: 'Create translation draft',
  translationRunning: 'Translating text',
  translationDraft: 'Translation result — not applied',
  translationCaptured:
    '{{source}} · {{from}} → {{to}} · {{count}} cue(s) · {{rules}} rule(s) · {{runtime}}',
  translationCapturedHelp:
    'These settings were captured when the request started. Later setting changes do not alter this draft. Drafts remain available on workspace navigation but are not saved with projects; apply before closing the document.',
  translationPolicy: 'How to update translated text',
  translationKeep: 'Keep all existing translated cues',
  translationReplace: 'Replace the whole translated layer',
  translationKeepHelp:
    'Keep every existing cue, including manual text, timings and extra rows; add generated cues only for missing IDs. Existing target text must already declare the requested target language.',
  translationReplaceHelp:
    'Replace all translated cues with the generated result, including any edits and extra rows. Requires separate confirmation when there is existing text. Other layers retain their content.',
  translationReview: 'Review against current translated text',
  translationCounts:
    'Kept {{kept}} · added {{added}} · replaced {{replaced}} · removed {{removed}}',
  translationStaleHelp:
    'The document changed after this comparison. Review again. A changed source requires a new translation request; a target-only edit can be reviewed again without rerunning the model.',
  translationComparison: 'Translation comparison by cue identity',
  translationGenerated: 'Generated text',
  translationAfter: 'Result after application',
  translationFinalTime: 'Result time (seconds)',
  translationPrevious: 'Previous rows',
  translationNext: 'Next rows',
  translationPage: 'Page {{page}} of {{total}}',
  translationConfirm:
    'I reviewed the comparison and confirm replacing the entire translated layer, including my edits and extra cues.',
  translationApply: 'Apply to translated text',
  translationMissing: 'No local translation model is configured. Open model setup.',
  translationRuntimeMissing:
    'The local translation runtime is not installed. Install worker/requirements-translation.txt in the worker environment.',
  translationModelChanged:
    'The model bundle changed or failed verification. Restore the files or select a verified manifest again.',
  translationTargetMismatch:
    'Existing translated text has a different or unspecified language. Keep it unchanged, correct its declared language after checking it, or explicitly review a whole-layer replacement.',
  translationSourceChanged:
    'The captured source changed or is out of date. Existing text is retained. Review the source, then create a new translation draft.',
  translationCycle:
    'This source depends on the translated layer. Choose an independent transcript or displayed source to avoid circular provenance.',
  translationLimit:
    'Translation exceeded an input, token, replacement or output limit. Shorten the affected source segments or rules and retry; nothing has been applied.',
  translationTruncated:
    'The model did not finish a segment within its decoding limit. The entire result was rejected; shorten the source segments and retry.',
  translationInvalid:
    'The request, bundle, rules or returned result is invalid. Check the selection; existing text is retained.',
  translationDiskLow:
    'Not enough workspace space for temporary translation files. Free space and retry.',
  translationFailed:
    'Local translation did not finish. Check the runtime and model, then retry. Existing text and the previous successful draft are retained.',
};
export const translationVi: Record<keyof typeof translationEn, string> = {
  translationTitle: 'Dịch cục bộ',
  translationIntro:
    'Dịch bản chép lời hoặc phụ đề hiển thị thành bản nháp riêng. Chỉ thay bản dịch sau khi duyệt và áp dụng rõ ràng; không tự thay nội dung đọc hay phụ đề hiển thị.',
  translationLimits:
    'Chỉ chạy CPU. Mỗi yêu cầu tối đa 500 câu không trống và 100 KB văn bản nguồn; đoạn quá dài bị từ chối, không cắt ngầm. Giữ mốc thời gian nguồn. Không tạo giọng nói hay căn thời gian giọng đọc.',
  translationReady:
    'Đã thấy bộ mô hình cục bộ. Mỗi lần dịch đều xác minh lại file; trạng thái sẵn sàng không bảo đảm chất lượng dịch.',
  translationSetup: 'Cấu hình mô hình dịch cục bộ',
  translationSetupHelp:
    'Chọn manifest JSON cho bộ mô hình song ngữ CTranslate2/SentencePiece đã chuẩn bị. Cài riêng thư viện chạy. Không tải gì. Xem định dạng bộ mô hình và SHA-256 tại docs/development/local-translation.md.',
  translationSource: 'Lớp nguồn',
  translationFrom: 'Ngôn ngữ nguồn',
  translationTo: 'Ngôn ngữ đích',
  translationPairMissing:
    'Bộ mô hình không khớp chiều dịch đã chọn. Chọn đúng cặp đã khai báo hoặc cấu hình bộ khác; không tự đổi mô hình.',
  translationLanguageMismatch:
    'Ngôn ngữ khai báo của lớp nguồn khác yêu cầu này. Kiểm tra văn bản và chọn đúng ngôn ngữ nguồn.',
  translationRules: 'Thay thế chuỗi sau khi dịch',
  translationRulesHelp:
    'Tùy chọn, chạy theo thứ tự và phân biệt hoa thường, chỉ trên văn bản đích vừa tạo. Không dùng biểu thức chính quy hay từ điển cho mô hình. Tối đa 50 quy tắc, 256 ký tự mỗi ô. Để trống phần thay thế để xóa chuỗi khớp; kết quả trống bị từ chối.',
  translationRuleFind: 'Quy tắc {{number}}: tìm',
  translationRuleReplace: 'Quy tắc {{number}}: thay bằng',
  translationRuleRemove: 'Xóa quy tắc {{number}}',
  translationRuleAdd: 'Thêm thay thế',
  translationStart: 'Tạo bản nháp dịch',
  translationRunning: 'Đang dịch văn bản',
  translationDraft: 'Kết quả dịch — chưa áp dụng',
  translationCaptured:
    '{{source}} · {{from}} → {{to}} · {{count}} câu · {{rules}} quy tắc · {{runtime}}',
  translationCapturedHelp:
    'Đây là thiết lập lúc gửi yêu cầu. Thay thiết lập sau đó không đổi bản nháp này. Bản nháp còn khi chuyển khu vực làm việc nhưng chưa lưu trong dự án; cần áp dụng trước khi đóng tài liệu.',
  translationPolicy: 'Cách cập nhật bản dịch',
  translationKeep: 'Giữ tất cả câu dịch hiện có',
  translationReplace: 'Thay toàn bộ lớp bản dịch',
  translationKeepHelp:
    'Giữ mọi câu hiện có, gồm văn bản sửa tay, thời gian và dòng bổ sung; chỉ thêm câu mới có ID chưa tồn tại. Văn bản đích hiện có phải khai báo đúng ngôn ngữ đích của yêu cầu.',
  translationReplaceHelp:
    'Thay tất cả câu dịch bằng kết quả vừa tạo, gồm cả phần sửa tay và dòng bổ sung. Cần xác nhận riêng khi đã có văn bản. Các lớp khác giữ nguyên nội dung.',
  translationReview: 'Duyệt với bản dịch hiện tại',
  translationCounts: 'Giữ {{kept}} · thêm {{added}} · thay {{replaced}} · xóa {{removed}}',
  translationStaleHelp:
    'Tài liệu đổi sau lần so sánh này. Hãy duyệt lại. Nguồn đổi thì cần dịch lại; chỉ sửa lớp đích thì có thể duyệt lại mà không chạy mô hình.',
  translationComparison: 'So sánh bản dịch theo ID câu',
  translationGenerated: 'Văn bản vừa tạo',
  translationAfter: 'Kết quả sau khi áp dụng',
  translationFinalTime: 'Thời gian kết quả (giây)',
  translationPrevious: 'Các dòng trước',
  translationNext: 'Các dòng sau',
  translationPage: 'Trang {{page}} / {{total}}',
  translationConfirm:
    'Tôi đã duyệt so sánh và xác nhận thay toàn bộ lớp bản dịch, gồm phần sửa tay và câu bổ sung.',
  translationApply: 'Áp dụng vào bản dịch',
  translationMissing: 'Chưa cấu hình mô hình dịch cục bộ. Mở phần cấu hình mô hình.',
  translationRuntimeMissing:
    'Chưa cài thư viện dịch cục bộ. Cài worker/requirements-translation.txt vào môi trường worker.',
  translationModelChanged:
    'Bộ mô hình đã đổi hoặc không qua xác minh. Khôi phục file hoặc chọn lại manifest đã kiểm tra.',
  translationTargetMismatch:
    'Bản dịch hiện có khai báo ngôn ngữ khác hoặc chưa khai báo. Giữ nguyên nó, sửa ngôn ngữ khai báo sau khi kiểm tra, hoặc chủ động duyệt thay toàn bộ lớp.',
  translationSourceChanged:
    'Nguồn đã đổi hoặc đang cần duyệt lại. Văn bản hiện có vẫn được giữ. Duyệt nguồn rồi tạo bản nháp dịch mới.',
  translationCycle:
    'Lớp nguồn này phụ thuộc bản dịch. Chọn bản chép lời hoặc phụ đề hiển thị độc lập để tránh vòng tham chiếu nguồn.',
  translationLimit:
    'Vượt giới hạn đầu vào, token, thay thế hoặc kết quả dịch. Rút ngắn đoạn nguồn hoặc quy tắc rồi thử lại; chưa áp dụng gì.',
  translationTruncated:
    'Mô hình chưa hoàn thành một đoạn trong giới hạn sinh văn bản. Toàn bộ kết quả bị từ chối; rút ngắn đoạn nguồn rồi thử lại.',
  translationInvalid:
    'Yêu cầu, bộ mô hình, quy tắc hoặc kết quả không hợp lệ. Kiểm tra lựa chọn; văn bản hiện có vẫn được giữ.',
  translationDiskLow:
    'Workspace không đủ chỗ cho file dịch tạm. Giải phóng dung lượng rồi thử lại.',
  translationFailed:
    'Dịch cục bộ chưa hoàn tất. Kiểm tra thư viện và mô hình rồi thử lại. Văn bản hiện có và bản nháp thành công trước đó vẫn được giữ.',
};
export function translationErrorKey(code: string): string {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'MODEL_MISSING') return 'translationMissing';
  if (code === 'MODEL_RUNTIME_MISSING') return 'translationRuntimeMissing';
  if (
    [
      'MODEL_CHANGED',
      'MODEL_HASH_MISMATCH',
      'MODEL_FILE_MISSING',
      'TRANSLATION_MODEL_CHANGED',
    ].includes(code)
  )
    return 'translationModelChanged';
  if (code === 'MODEL_LANGUAGE_UNAVAILABLE') return 'translationPairMissing';
  if (code === 'TRANSLATION_LANGUAGE_MISMATCH') return 'translationLanguageMismatch';
  if (code === 'TRANSLATION_TARGET_LANGUAGE_MISMATCH') return 'translationTargetMismatch';
  if (code === 'TEXT_LAYER_CYCLE') return 'translationCycle';
  if (code === 'TRANSLATION_SOURCE_CHANGED' || code === 'TEXT_LAYER_STALE')
    return 'translationSourceChanged';
  if (code === 'TEXT_LAYER_EMPTY') return 'textLayerEmpty';
  if (code === 'STALE_OPERATION') return 'translationStaleHelp';
  if (code === 'TRANSLATION_TRUNCATED') return 'translationTruncated';
  if (code.includes('LIMIT') || code.includes('TOO_LARGE')) return 'translationLimit';
  if (code === 'TRANSLATION_DISK_LOW') return 'translationDiskLow';
  if (code === 'INVALID_REQUEST' || code.includes('INVALID')) return 'translationInvalid';
  return 'translationFailed';
}
