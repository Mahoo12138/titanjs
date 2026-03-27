/** CSS files imported via tsup loader '.css':'text' are plain strings */
declare module '*.css' {
  const content: string
  export default content
}
