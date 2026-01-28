import { FunctionComponent } from "react";
import {
  Select,
  InputLabel,
  FormHelperText,
  FormControl,
} from "@mui/material";
import NavigationBar from "../components/NavigationBar";
import Header from "../components/Header";
import DatePicker from "../components/DatePicker";
import styles from "./Dashboard.module.css";

const Dashboard: FunctionComponent = () => {
  return (
    <div className={styles.dashboard}>
      <NavigationBar
        door="open"
        divider="/divider.svg"
        iconBorder4="none"
        iconPadding4="0"
        iconBackgroundColor4="transparent"
        iconBorder5="none"
        iconPadding5="0"
        iconBackgroundColor5="transparent"
        selectedItem="dashboard"
      />
      <main className={styles.maincomponentright}>
        <Header logoMarque="/logoMarque@2x.png" />
        <section className={styles.variabledashboardcomponent}>
          <FormControl
            className={styles.chooseagentai}
            variant="outlined"
            sx={{
              borderRadius: "0px 0px 0px 0px",
              width: "152px",
              height: "36px",
              m: 0,
              p: 0,
              "& .MuiInputBase-root": {
                m: 0,
                p: 0,
                minHeight: "36px",
                justifyContent: "center",
                display: "inline-flex",
              },
              "& .MuiInputLabel-root": {
                m: 0,
                p: 0,
                minHeight: "36px",
                display: "inline-flex",
              },
              "& .MuiMenuItem-root": {
                m: 0,
                p: 0,
                height: "36px",
                display: "inline-flex",
              },
              "& .MuiSelect-select": {
                m: 0,
                p: 0,
                height: "36px",
                alignItems: "center",
                display: "inline-flex",
              },
              "& .MuiInput-input": { m: 0, p: 0 },
              "& .MuiInputBase-input": { textAlign: "left", p: "0 !important" },
            }}
          >
            <InputLabel color="primary" />
            <Select color="primary" disableUnderline displayEmpty />
            <FormHelperText />
          </FormControl>
          <div className={styles.datepicker}>
            <DatePicker
              size="Small"
              state="Enabled"
              type="Round"
              width="Default"
            />
            <DatePicker
              size="Small"
              state="Enabled"
              type="Round"
              width="Default"
            />
          </div>
        </section>
        <section className={styles.allstatistics}>
          <div className={styles.topstatistics}>
            <div className={styles.lefttopstatistics} />
            <div className={styles.lefttopstatistics} />
          </div>
          <div className={styles.bottomstatistics} />
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
