export type KakaoRequest = {
  userRequest: {
    utterance: string;
  };
};

export type KakaoSimpleText = {
  version: "2.0";
  template: {
    outputs: {
      simpleText: {
        text: string;
      };
    }[];
  };
};