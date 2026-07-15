"""로그 파서 플러그인 인터페이스.

실제 로그 포맷은 미확정이므로, 모델/검사기 종류별로 파서를 교체할 수 있게 설계.
새 포맷이 확정되면 BaseParser 를 상속한 클래스를 만들어 registry 에 등록하면 된다.
"""
from abc import ABC, abstractmethod


class BaseParser(ABC):
    #: 사람이 읽는 파서 이름
    name = "base"

    @abstractmethod
    def parse(self, text):
        """로그 텍스트를 파싱해 표준 형식으로 반환.

        반환 형식:
        {
          "measurements": [
             {"item": "Open_CH1", "value": 15000, "spec_low": 0, "spec_high": 150000,
              "repeat_index": None},
             ...
          ]
        }
        (repeat_index 가 있으면 반복성 데이터, None 이면 단일 측정)
        """
        raise NotImplementedError
