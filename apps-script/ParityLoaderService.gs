function getClientParityContentWeb() {
  return HtmlService.createHtmlOutputFromFile('ClientParity').getContent();
}
