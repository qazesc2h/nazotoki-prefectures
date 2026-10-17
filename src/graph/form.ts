/* 규칙 그래프 — 상단 폼: 단어 추가(텍스트/빈 칸) · 전체 삭제 */
import { toAsciiDigits } from '../shared/kana';
import { graphValidateCharCount, graphAddWord, graphAddWordFromText } from './model';
import { graphState, graphSaveState, graphResetContent } from './state';
import { graphRender } from './render-hook';
import { graphResetWordEdit } from './word-list';

export function graphInitForm(): void {
  const addBtn = document.getElementById('graphAddWord');
  const clearBtn = document.getElementById('graphClearAll');
  const charCountInput = document.getElementById('graphCharCount') as HTMLInputElement | null;

  /* 전각 숫자 입력 시 즉시 반각으로 정규화 */
  if (charCountInput) {
    charCountInput.addEventListener('input', function() {
      const a = toAsciiDigits(charCountInput.value).replace(/[^0-9]/g, '');
      if (a !== charCountInput.value) charCountInput.value = a;
    });
  }

  if (addBtn && charCountInput) {
    addBtn.addEventListener('click', function() {
      const n = parseInt(toAsciiDigits(charCountInput.value), 10);
      if (!graphValidateCharCount(n)) {
        alert('글자 수는 1~12 사이의 정수를 입력하세요.');
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
        alert('단어는 1~12글자로 입력하세요.');
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
      if (!confirm('모든 단어와 규칙을 삭제하시겠습니까?')) return;
      graphResetWordEdit();
      graphResetContent();
      graphSaveState();
      graphRender();
    });
  }
}
