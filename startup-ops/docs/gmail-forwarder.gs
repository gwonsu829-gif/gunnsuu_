/**
 * Gmail → 업무 자동 분류 대시보드
 *
 * script.google.com 에 붙여넣고 트리거를 걸면, 지정한 라벨이 붙은 메일을
 * 대시보드로 보낸다. 도메인도 외부 서비스 가입도 필요 없다.
 *
 * 설정: 아래 세 값만 본인 것으로 바꾼다.
 */

const ENDPOINT = 'https://gunnsuu.vercel.app/api/ingest/email';
const SECRET = '여기에_INGEST_SECRET_붙여넣기';
const LABEL_NAME = '할일수집';

/** 한 번에 처리할 스레드 수. 실행 시간 제한에 걸리지 않게 적당히 끊는다. */
const MAX_THREADS = 10;

/** 아주 긴 메일은 잘라 보낸다. 할일은 보통 앞부분에 있다. */
const MAX_BODY_CHARS = 8000;

function forwardToDashboard() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    throw new Error(
      'Gmail에 "' + LABEL_NAME + '" 라벨이 없습니다. 먼저 라벨을 만들어 주세요.'
    );
  }

  const threads = label.getThreads(0, MAX_THREADS);
  if (threads.length === 0) {
    console.log('보낼 메일이 없습니다.');
    return;
  }

  for (const thread of threads) {
    let allSent = true;

    for (const message of thread.getMessages()) {
      const payload = {
        from: message.getFrom(),
        subject: message.getSubject(),
        text: message.getPlainBody().slice(0, MAX_BODY_CHARS),
        // 같은 메일이 두 번 들어와도 대시보드가 중복 처리하지 않도록 하는 열쇠
        messageId: message.getId(),
        receivedAt: message.getDate().toISOString(),
      };

      const response = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-secret': SECRET },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code !== 200) {
        console.error(
          '실패 (' + code + '): ' + message.getSubject() +
          ' — ' + response.getContentText().slice(0, 200)
        );
        allSent = false;
        break;
      }

      console.log('보냄: ' + message.getSubject());
    }

    // 다 보낸 스레드만 라벨을 뗀다.
    // 실패하면 라벨이 남아 다음 실행에서 다시 시도한다.
    if (allSent) {
      thread.removeLabel(label);
    }
  }
}

/**
 * 설정이 맞는지 한 번에 확인한다.
 * 실행하면 가짜 메일 한 통을 보내 응답을 로그에 남긴다.
 */
function testConnection() {
  const response = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': SECRET },
    payload: JSON.stringify({
      from: '테스트 <test@example.com>',
      subject: '[연결 확인] Apps Script에서 보냄',
      text: '내일까지 연동 확인 결과 정리해서 공유 부탁드립니다.',
      messageId: 'apps-script-test-' + Date.now(),
    }),
    muteHttpExceptions: true,
  });

  console.log('응답 코드: ' + response.getResponseCode());
  console.log('응답 내용: ' + response.getContentText());
}
