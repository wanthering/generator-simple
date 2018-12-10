const app = new Vue({
  el: '#<%- id %>',
  data: {
    message: "<%= options.message %>"
  }
})