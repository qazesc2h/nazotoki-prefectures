/* 규칙 그래프 — 상단 폼: 단어 추가(텍스트/빈 칸) · 전체 삭제 */
import { bindNumericInput } from '../shared/inputs';
import { askConfirm, notify } from '../shared/dialog';
import { graphValidateCharCount, graphAddWord, graphAddWordFromText } from './model';
import { graphState, graphSaveState, graphResetContent } from './state';
import { graphRender } from './render-hook';
import { graphResetWordEdit } from './word-list';

export function graphInitForm(): void {
  const addBtn = document.getElementById('graphAddWord');
  const clearBtn = document.getElementById('graphClearAll');
  const charCountInput = document.getElementById('graphCharCount') as HTMLInputElement | null;

  /* 숫자 입력 공용 동작 (전각 즉시 반각, 숫자만) */
  const readCharCount = charCountInput ? bindNumericInput(charCountInput, { min: 1, max: 12, fallback: () => 5 }) : () => 5;

  if (addBtn && charCountInput) {
    addBtn.addEventListener('click', function() {
      const n = readCharCount();
      if (!graphValidateCharCount(n)) {
        notify('글자 수는 1~12 사이의 정수를 입력하세요.');
        return;
      }
      const newWords = graphAddWord(graphState.words, n);
      if (newWords) {
        graphState.words = newWords;
        graphSaveState();
        graphRender();
      }
    });
  }

  /* 단어 텍스트로 추가 (글자가 채워진 단어) — 엔터 또는 「+ 단어 추가」 */
  const wordTextInput = document.getElementById('graphWordText') as HTMLInputElement | null;
  const addWordTextBtn = document.getElementById('graphAddWordText');
  if (wordTextInput && addWordTextBtn) {
    const addByText = function() {
      const newWords = graphAddWordFromText(graphState.words, wordTextInput.value);
      if (!newWords) {
        notify('단어는 1~12글자로 입력하세요.');
        return;
      }
      graphState.words = newWords;
      graphSaveState();
      graphRender();   /* 엔진 재계산·렌더 포함 → 채워진 글자로 추론/충돌 즉시 반영 */
      wordTextInput.value = '';
      wordTextInput.focus();
    };
    addWordTextBtn.addEventListener('click', addByText);
    wordTextInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); addByText(); } });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (!graphState.words.length) return;
      askConfirm('모든 단어와 규칙을 삭제하시겠습니까?', { ok: '삭제' }).then(function(ok) {
        if (!ok) return;
        graphResetWordEdit();
        graphResetContent();
        graphSaveState();
        graphRender();
      });
    });
  }
}
