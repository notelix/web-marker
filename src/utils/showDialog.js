import React, { useState } from "react";
import ReactDOM from "react-dom";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";

function getDialogButtons(dialogInstance, context) {
  if (dialogInstance.DialogButtons) {
    return dialogInstance.DialogButtons(context);
  } else {
    const { closeDialog } = context;
    return (
      <Button autoFocus onClick={() => closeDialog()} variant="contained">
        Close
      </Button>
    );
  }
}

function showDialog(DialogClass, props) {
  return new Promise((resolve) => {
    const dialogRoot = document.createElement("div");
    let clearUp = null;
    document.body.appendChild(dialogRoot);

    const Root = () => {
      const [open, setOpen] = useState(true);
      const [dialogButtons, setDialogButtons] = useState(null);

      const dialogInstance = React.createElement(DialogClass, {
        ...(props || {}),
        ref: (instance) => {
          if (!instance || dialogButtons) {
            return;
          }
          setDialogButtons(
            getDialogButtons(instance, {
              closeDialog: (resolution) => {
                resolve(resolution);
                setOpen(false);
                clearUp();
              },
            })
          );
        },
      });
      return (
        <Dialog open={open}>
          <DialogTitle id="customized-dialog-title">
            {DialogClass.DialogTitle || "Dialog"}
          </DialogTitle>
          <DialogContent dividers>{dialogInstance}</DialogContent>
          <DialogActions>{dialogButtons}</DialogActions>
        </Dialog>
      );
    };

    ReactDOM.render(<Root />, dialogRoot);

    clearUp = () => {
      setTimeout(() => {
        ReactDOM.unmountComponentAtNode(dialogRoot);
        try {
          document.body.removeChild(dialogRoot);
        } catch (e) {
          console.warn(e);
        }
      }, 1000);
    };
  });
}

export default showDialog;
