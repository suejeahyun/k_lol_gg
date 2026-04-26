export function createSimpleText(text: string) {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text,
          },
        },
      ],
    },
  };
}