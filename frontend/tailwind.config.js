export default {
  content:["./index.html","./src/**/*.{js,jsx}"],
  theme:{
    extend:{
      colors:{
        fuelo:{ coral:"#CC8066", ink:"#111827", slate:"#334155", muted:"#4B5563", surface:"#191C21", line:"#E5E7EB", bg:"#FFFFFF", soft:"#F8FAFC" }
      },
      fontFamily:{ sans:["Inter","ui-sans-serif","system-ui","sans-serif"], mono:["JetBrains Mono","ui-monospace","monospace"] },
      boxShadow:{ panel:"0 1px 2px rgba(17,24,39,.04),0 10px 30px rgba(17,24,39,.05)", float:"0 16px 50px rgba(17,24,39,.12)" }
    }
  },
  plugins:[]
}