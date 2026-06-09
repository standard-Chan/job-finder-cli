const fs = require("node:fs");
const readline = require("node:readline");

function createPrompt(input = process.stdin, output = process.stdout) {
  if (!input.isTTY) {
    return createBufferedPrompt(output);
  }

  const rl = readline.createInterface({
    input,
    output,
  });

  return {
    ask(question) {
      return askWithInterface(rl, question);
    },
    close() {
      rl.close();
    },
  };
}

function createBufferedPrompt(output) {
  const answers = fs.readFileSync(0, "utf8").split(/\r?\n/);
  let index = 0;

  return {
    ask(question) {
      output.write(question);
      const answer = answers[index] || "";
      index += 1;
      return Promise.resolve(answer.trim());
    },
    close() {},
  };
}

function ask(question) {
  const prompt = createPrompt();

  return prompt.ask(question).finally(() => {
    prompt.close();
  });
}

function askWithInterface(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

module.exports = {
  ask,
  createPrompt,
};
