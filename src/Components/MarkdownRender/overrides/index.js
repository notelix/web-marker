export default (props) => ({
  pre: require("./pre").default,
  math: require("./math").default,

  table: {
    props: {
      className:
        "table is-bordered is-striped is-narrow is-hoverable is-fullwidth",
    },
  },
});
